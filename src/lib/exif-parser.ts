/**
 * EXIF Parser - Extract metadata from images without external dependencies
 * Supports: DateTimeOriginal, GPS coordinates, Camera make/model
 */

export interface ExifData {
  dateTime: Date | null;
  latitude: number | null;
  longitude: number | null;
  make: string | null;
  model: string | null;
}

interface ExifTags {
  [key: number]: string | number | number[];
}

const EXIF_TAGS: Record<number, string> = {
  0x010f: 'Make',
  0x0110: 'Model',
  0x0112: 'Orientation',
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
};

const GPS_TAGS: Record<number, string> = {
  0x0001: 'GPSLatitudeRef',
  0x0002: 'GPSLatitude',
  0x0003: 'GPSLongitudeRef',
  0x0004: 'GPSLongitude',
};

export async function extractExifData(file: File): Promise<ExifData> {
  const defaultResult: ExifData = {
    dateTime: null,
    latitude: null,
    longitude: null,
    make: null,
    model: null,
  };

  // Only process JPEG images
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) {
    return defaultResult;
  }

  try {
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer(); // Read first 128KB
    const view = new DataView(buffer);

    // Check for JPEG magic bytes
    if (view.getUint16(0) !== 0xffd8) {
      return defaultResult;
    }

    // Find EXIF marker (APP1)
    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      
      if (marker === 0xffe1) {
        // Found APP1 marker
        const length = view.getUint16(offset + 2);
        const exifStart = offset + 4;

        // Check for EXIF header
        const exifHeader = String.fromCharCode(
          view.getUint8(exifStart),
          view.getUint8(exifStart + 1),
          view.getUint8(exifStart + 2),
          view.getUint8(exifStart + 3)
        );

        if (exifHeader === 'Exif') {
          const tiffStart = exifStart + 6;
          const result = parseExifData(view, tiffStart);
          return result;
        }
      }

      // Move to next marker
      if ((marker & 0xff00) !== 0xff00) {
        break;
      }
      
      const markerLength = view.getUint16(offset + 2);
      offset += 2 + markerLength;
    }

    return defaultResult;
  } catch (error) {
    console.warn('Error extracting EXIF data:', error);
    return defaultResult;
  }
}

function parseExifData(view: DataView, tiffStart: number): ExifData {
  const result: ExifData = {
    dateTime: null,
    latitude: null,
    longitude: null,
    make: null,
    model: null,
  };

  try {
    // Check byte order (II = little-endian, MM = big-endian)
    const byteOrder = view.getUint16(tiffStart);
    const littleEndian = byteOrder === 0x4949;

    // Verify TIFF magic number
    if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) {
      return result;
    }

    // Get offset to first IFD
    const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
    
    // Parse IFD0
    const exifTags = parseIFD(view, tiffStart, ifdOffset, littleEndian);
    
    // Extract basic info
    if (exifTags.make) result.make = String(exifTags.make);
    if (exifTags.model) result.model = String(exifTags.model);

    // Look for EXIF sub-IFD for DateTimeOriginal
    if (exifTags.exifIFD) {
      const exifSubTags = parseIFD(view, tiffStart, exifTags.exifIFD as number, littleEndian);
      if (exifSubTags.dateTimeOriginal) {
        result.dateTime = parseExifDateTime(String(exifSubTags.dateTimeOriginal));
      }
    }

    // Look for GPS IFD
    if (exifTags.gpsIFD) {
      const gpsTags = parseGPSIFD(view, tiffStart, exifTags.gpsIFD as number, littleEndian);
      result.latitude = gpsTags.latitude;
      result.longitude = gpsTags.longitude;
    }

  } catch (error) {
    console.warn('Error parsing EXIF:', error);
  }

  return result;
}

function parseIFD(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean
): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  
  try {
    const absoluteOffset = tiffStart + ifdOffset;
    const entryCount = view.getUint16(absoluteOffset, littleEndian);

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = absoluteOffset + 2 + i * 12;
      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);
      const valueOffset = entryOffset + 8;

      // Handle specific tags
      switch (tag) {
        case 0x010f: // Make
          result.make = readString(view, tiffStart, valueOffset, count, littleEndian);
          break;
        case 0x0110: // Model
          result.model = readString(view, tiffStart, valueOffset, count, littleEndian);
          break;
        case 0x8769: // EXIF IFD
          result.exifIFD = view.getUint32(valueOffset, littleEndian);
          break;
        case 0x8825: // GPS IFD
          result.gpsIFD = view.getUint32(valueOffset, littleEndian);
          break;
        case 0x9003: // DateTimeOriginal
          result.dateTimeOriginal = readString(view, tiffStart, valueOffset, count, littleEndian);
          break;
      }
    }
  } catch (error) {
    console.warn('Error parsing IFD:', error);
  }

  return result;
}

function parseGPSIFD(
  view: DataView,
  tiffStart: number,
  gpsOffset: number,
  littleEndian: boolean
): { latitude: number | null; longitude: number | null } {
  const result = { latitude: null as number | null, longitude: null as number | null };
  
  try {
    const absoluteOffset = tiffStart + gpsOffset;
    const entryCount = view.getUint16(absoluteOffset, littleEndian);
    
    let latRef = 'N';
    let lonRef = 'E';
    let latValues: number[] | null = null;
    let lonValues: number[] | null = null;

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = absoluteOffset + 2 + i * 12;
      const tag = view.getUint16(entryOffset, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);
      const valueOffset = entryOffset + 8;

      switch (tag) {
        case 0x0001: // GPSLatitudeRef
          latRef = String.fromCharCode(view.getUint8(valueOffset));
          break;
        case 0x0002: // GPSLatitude
          latValues = readRationals(view, tiffStart, valueOffset, 3, littleEndian);
          break;
        case 0x0003: // GPSLongitudeRef
          lonRef = String.fromCharCode(view.getUint8(valueOffset));
          break;
        case 0x0004: // GPSLongitude
          lonValues = readRationals(view, tiffStart, valueOffset, 3, littleEndian);
          break;
      }
    }

    if (latValues) {
      result.latitude = convertDMSToDecimal(latValues, latRef);
    }
    if (lonValues) {
      result.longitude = convertDMSToDecimal(lonValues, lonRef);
    }
  } catch (error) {
    console.warn('Error parsing GPS IFD:', error);
  }

  return result;
}

function readString(
  view: DataView,
  tiffStart: number,
  valueOffset: number,
  length: number,
  littleEndian: boolean
): string {
  let offset = valueOffset;
  
  // If string is longer than 4 bytes, it's stored as a pointer
  if (length > 4) {
    offset = tiffStart + view.getUint32(valueOffset, littleEndian);
  }
  
  let str = '';
  for (let i = 0; i < length - 1; i++) {
    const char = view.getUint8(offset + i);
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str;
}

function readRationals(
  view: DataView,
  tiffStart: number,
  valueOffset: number,
  count: number,
  littleEndian: boolean
): number[] {
  // Rationals are stored as pointer since they're 8 bytes each
  const offset = tiffStart + view.getUint32(valueOffset, littleEndian);
  const values: number[] = [];
  
  for (let i = 0; i < count; i++) {
    const numerator = view.getUint32(offset + i * 8, littleEndian);
    const denominator = view.getUint32(offset + i * 8 + 4, littleEndian);
    values.push(denominator ? numerator / denominator : 0);
  }
  
  return values;
}

function convertDMSToDecimal(dms: number[], ref: string): number {
  const [degrees, minutes, seconds] = dms;
  let decimal = degrees + minutes / 60 + seconds / 3600;
  
  if (ref === 'S' || ref === 'W') {
    decimal = -decimal;
  }
  
  return decimal;
}

function parseExifDateTime(dateStr: string): Date | null {
  // EXIF date format: "YYYY:MM:DD HH:MM:SS"
  const match = dateStr.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
  }
  return null;
}
