import {
  AlertCircleIcon,
  BarChartIcon,
  Github,
  Note01Icon,
  Plug01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams, useRouterState } from "@tanstack/react-router";

import { ServiceSwitcher } from "@/components/services/service-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  {
    title: "Overview",
    to: "/services/$serviceId/overview" as const,
    icon: BarChartIcon,
  },
  {
    title: "Logs",
    to: "/services/$serviceId/logs" as const,
    icon: Note01Icon,
  },
  {
    title: "Errors",
    to: "/services/$serviceId/errors" as const,
    icon: AlertCircleIcon,
  },
  {
    title: "Endpoints",
    to: "/services/$serviceId/endpoints" as const,
    icon: Plug01Icon,
  },
  {
    title: "Settings",
    to: "/services/$serviceId/settings" as const,
    icon: Settings01Icon,
  },
];

export function AppSidebar() {
  const { serviceId } = useParams({ from: "/_app/services/$serviceId" });
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  const { setOpenMobile } = useSidebar();

  const isActive = (page: string) => pathname.split("/").at(-1) === page;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <ServiceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link to={item.to} params={{ serviceId }} />}
                    tooltip={item.title}
                    onClick={() => setOpenMobile(false)}
                    isActive={isActive(item.to.split("/").at(-1) ?? "")}
                  >
                    <HugeiconsIcon icon={item.icon} size={16} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                // oxlint-disable-next-line jsx_a11y/anchor-has-content
                <a
                  href="https://github.com/gozsunday/deko"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              onClick={() => setOpenMobile(false)}
              tooltip="GitHub"
            >
              <HugeiconsIcon icon={Github} size={16} />
              <span>GitHub</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
