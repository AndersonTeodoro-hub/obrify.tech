// Converte números "soltos" em prosa para palavras faláveis pt-PT, para o TTS
// ler sem ambiguidade ("21.45"→"vinte e um vírgula quarenta e cinco", "-6"→
// "menos seis"). Só toca em números rodeados por espaço/pontuação — NÃO mexe em
// códigos alfanuméricos (A500, C30, INC-001, 6m) nem no texto mostrado no ecrã.
const U = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","catorze","quinze","dezasseis","dezassete","dezoito","dezanove"];
const T = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
const H = ["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];

function sub100(n: number): string {
  if (n < 20) return U[n];
  const t = Math.floor(n / 10), u = n % 10;
  return u ? `${T[t]} e ${U[u]}` : T[t];
}
function sub1000(n: number): string {
  if (n === 100) return "cem";
  if (n < 100) return sub100(n);
  const h = Math.floor(n / 100), r = n % 100;
  return r ? `${H[h]} e ${sub100(r)}` : H[h];
}
function numToPtWords(n: number): string {
  if (n < 1000) return sub1000(n);
  if (n > 9999) return String(n); // fora do alcance típico de cotas/pisos — deixa cru
  const th = Math.floor(n / 1000), r = n % 1000;
  const thWord = th === 1 ? "mil" : `${sub1000(th)} mil`;
  return r ? `${thWord} e ${sub1000(r)}` : thWord;
}
function fracToWords(frac: string): string {
  if (frac.length <= 2 && frac[0] !== "0") return numToPtWords(parseInt(frac, 10));
  return frac.split("").map((d) => U[Number(d)]).join(" "); // preserva zeros à esquerda
}

export function toSpeakablePt(text: string): string {
  if (!text) return text;
  // (início|espaço|"(") + sinal? + inteiro + (decimal)? seguido de espaço/pontuação/fim
  return text.replace(
    /(^|[\s(])(-?)(\d+)([.,](\d+))?(?=[\s).,;:!?]|$)/g,
    (_m, pre, sign, intPart, _decGroup, frac) => {
      const neg = sign === "-" ? "menos " : "";
      const intWords = numToPtWords(parseInt(intPart, 10));
      const decWords = frac ? ` vírgula ${fracToWords(frac)}` : "";
      return `${pre}${neg}${intWords}${decWords}`;
    },
  );
}
