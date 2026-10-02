import { Layers01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  $getServiceEnvironments,
  environmentsQueryOptions,
} from "@/server/dashboard";

const ALL_ENVIRONMENTS = "All environments";

export function EnvironmentSelector() {
  const { serviceId } = useParams({ from: "/_app/services/$serviceId" });
  const search = useSearch({ from: "/_app/services/$serviceId" });
  const navigate = useNavigate();
  const getServiceEnvironments = useServerFn($getServiceEnvironments);

  const { data } = useQuery({
    ...environmentsQueryOptions(serviceId),
    queryFn: () => getServiceEnvironments({ data: serviceId }),
  });

  const environments = data?.environments ?? [];
  if (environments.length <= 1) return null;

  const selected = search.environment ?? ALL_ENVIRONMENTS;

  const handleValueChange = (value: string | null) => {
    if (value === null) return;

    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        environment: value === ALL_ENVIRONMENTS ? undefined : value,
      }),
      replace: true,
    });
  };

  return (
    <Select value={selected} onValueChange={handleValueChange}>
      <SelectTrigger size="sm" className="gap-1.5">
        <HugeiconsIcon
          icon={Layers01Icon}
          size={12}
          className="text-muted-foreground"
        />
        <SelectValue className="sr-only sm:not-sr-only" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL_ENVIRONMENTS}>All environments</SelectItem>
        {environments.map((environment) => (
          <SelectItem key={environment} value={environment}>
            {environment}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
