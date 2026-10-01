import {
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { z } from "zod";

import { DangerSettings } from "@/components/settings/danger-settings";
import { GeneralSettings } from "@/components/settings/general-settings";
import { TokensSettings } from "@/components/settings/tokens-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";

const settingsSearchSchema = z.object({
  section: z.enum(["general", "tokens", "danger"]).catch("general"),
});

export const Route = createFileRoute("/_app/services/$serviceId/settings")({
  validateSearch: settingsSearchSchema,
  component: SettingsPage,
});

function SettingsPage() {
  const { section } = useSearch({
    from: "/_app/services/$serviceId/settings",
  });
  const { serviceId } = useParams({
    from: "/_app/services/$serviceId/settings",
  });
  const navigate = useNavigate();

  // tailwind's default xl
  const isVertical = useMediaQuery("(min-width: 1280px)");

  const handleTabChange = async (value: "general" | "tokens" | "danger") => {
    await navigate({
      to: "/services/$serviceId/settings",
      params: { serviceId },
      search: { section: value },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Service configuration and token management.
        </p>
      </div>

      <Tabs
        value={section}
        onValueChange={handleTabChange}
        orientation={isVertical ? "vertical" : "horizontal"}
        className={isVertical ? "gap-8" : "gap-6"}
      >
        <TabsList className={isVertical ? "w-36 p-0" : undefined}>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>
        <TabsContent
          value="general"
          className={isVertical ? "pb-16" : undefined}
        >
          <GeneralSettings />
        </TabsContent>
        <TabsContent
          value="tokens"
          className={isVertical ? "pb-16" : undefined}
        >
          <TokensSettings />
        </TabsContent>
        <TabsContent
          value="danger"
          className={isVertical ? "pb-16" : undefined}
        >
          <DangerSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
