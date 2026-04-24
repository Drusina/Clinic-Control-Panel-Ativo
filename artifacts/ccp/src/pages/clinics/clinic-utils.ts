import type { ClinicPlano, ClinicStatus } from "@workspace/api-client-react";

export const getStatusBadgeVariant = (status: ClinicStatus) => {
  switch (status) {
    case "ativa":
      return "default";
    case "trial":
      return "secondary";
    case "prospect":
    case "proposta":
    case "contrato":
      return "outline";
    case "suspensa":
    case "desativada":
      return "destructive";
    default:
      return "outline";
  }
};

export const getPlanBadgeVariant = (plano: ClinicPlano) => {
  switch (plano) {
    case "enterprise":
      return "default";
    case "pro":
      return "secondary";
    case "starter":
      return "outline";
    default:
      return "outline";
  }
};
