import { Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SHARE_URL = "https://obrify.tech";

export function ShareButton() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const handleShare = async () => {
    const shareData = {
      title: t("share.title"),
      text: t("share.text"),
      url: SHARE_URL,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or error — ignore
      }
    } else {
      await navigator.clipboard.writeText(SHARE_URL);
      toast({ title: t("share.copied") });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleShare}
          className="h-8 w-8"
        >
          <Share2 className="h-4 w-4" />
          <span className="sr-only">{t("share.button")}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("share.button")}</TooltipContent>
    </Tooltip>
  );
}
