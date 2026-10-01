import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_app/services/$serviceId")({
  validateSearch: z.object({
    environment: z.string().optional(),
  }),
  component: () => <Outlet />,
});
