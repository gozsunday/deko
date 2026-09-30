import { describeRoute } from "hono-openapi";
import { z } from "zod";

import {
  ServiceSelectSchema,
  ServiceTokenPublicSchema,
  ServiceTokenSelectSchema,
} from "@repo/db/validators/service.validator";

import HttpStatusCodes from "@/lib/http-status-codes";
import {
  adminAuthMalformedExample,
  createAdminAuthErrorResponse,
  createErrorResponse,
  createGenericErrorResponse,
  createMalformedAdminAuthErrorResponse,
  createRateLimitErrorResponse,
  createServerErrorResponse,
  createSuccessResponse,
  getErrDetailsFromErrFields,
} from "@/lib/openapi";
import { authExamples, servicesExamples } from "@/lib/openapi-examples";

const tags = ["Service"];

export const getServicesDoc = describeRoute({
  description: "Get services",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Services retrieved", {
      details: "Services retrieved successfully",
      dataSchema: z.array(ServiceSelectSchema),
    }),
    [HttpStatusCodes.BAD_REQUEST]: createMalformedAdminAuthErrorResponse(),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const createServiceDoc = describeRoute({
  description: "Create a new service",
  tags,
  responses: {
    [HttpStatusCodes.CREATED]: createSuccessResponse("Service created", {
      details: "Service created successfully",
      dataSchema: ServiceSelectSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          servicesExamples.createServiceValErrs,
        ),
        fields: servicesExamples.createServiceValErrs,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getServiceDoc = describeRoute({
  description: "Get a single service",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Service retrieved", {
      details: "Service retrieved successfully",
      dataSchema: ServiceSelectSchema.extend({
        tokens: z.array(ServiceTokenPublicSchema),
      }),
    }),
    [HttpStatusCodes.BAD_REQUEST]: createMalformedAdminAuthErrorResponse(),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      {
        code: "NOT_FOUND",
        details: "Service not found",
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const updateServiceDoc = describeRoute({
  description: "Update a service",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Service updated", {
      details: "Service updated successfully",
      dataSchema: ServiceSelectSchema.extend({
        tokens: z.array(ServiceTokenPublicSchema),
      }),
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidServiceID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields({
          serviceId: "Invalid UUID",
        }),
        fields: {
          serviceId: "Invalid UUID",
        },
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          servicesExamples.updateServiceValErrs,
        ),
        fields: servicesExamples.updateServiceValErrs,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      {
        code: "NOT_FOUND",
        details: "Service not found",
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const deleteServiceDoc = describeRoute({
  description: "Delete a service",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Service deleted", {
      details: "Service deleted successfully",
      dataSchema: z.object({
        status: z.literal("ok"),
      }),
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidServiceID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields({
          id: "Invalid UUID",
        }),
        fields: {
          id: "Invalid UUID",
        },
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      {
        code: "NOT_FOUND",
        details: "Service not found",
      },
    ),
    [HttpStatusCodes.CONFLICT]: createGenericErrorResponse(
      "Service has attached tokens",
      {
        code: "SERVICE_HAS_TOKENS",
        details:
          "Cannot delete service with attached tokens. Delete all tokens first.",
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const createServiceTokenDoc = describeRoute({
  description: "Create a new service token",
  tags,
  responses: {
    [HttpStatusCodes.CREATED]: createSuccessResponse("Service token created", {
      details: "Service token created successfully",
      dataSchema: ServiceTokenSelectSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(authExamples.uuidValErr),
        fields: authExamples.uuidValErr,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          servicesExamples.createServiceTokenValErrs,
        ),
        fields: servicesExamples.createServiceTokenValErrs,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      {
        code: "NOT_FOUND",
        details: "Service not found",
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const updateServiceTokenDoc = describeRoute({
  description: "Update a service token",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Service token updated", {
      details: "Service token updated successfully",
      dataSchema: ServiceTokenPublicSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidServiceOrTokenID: {
        summary: "Invalid service or Token ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields({
          serviceId: "Invalid UUID",
          tokenId: "Invalid UUID",
        }),
        fields: {
          serviceId: "Invalid UUID",
          tokenId: "Invalid UUID",
        },
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          servicesExamples.updateServiceTokenValErrs,
        ),
        fields: servicesExamples.updateServiceTokenValErrs,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createErrorResponse(
      "Service or token not found",
      {
        serviceNotFound: {
          summary: "Service not found",
          code: "SERVICE_NOT_FOUND",
          details: "Service not found",
        },
        tokenNotFound: {
          summary: "Token not found",
          code: "TOKEN_NOT_FOUND",
          details: "Token not found",
        },
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const deleteServiceTokenDoc = describeRoute({
  description: "Delete a service token",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Service token deleted", {
      details: "Service token deleted successfully",
      dataSchema: z.object({
        status: z.literal("ok"),
      }),
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidServiceOrTokenID: {
        summary: "Invalid service or Token ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields({
          serviceId: "Invalid UUID",
          tokenId: "Invalid UUID",
        }),
        fields: {
          serviceId: "Invalid UUID",
          tokenId: "Invalid UUID",
        },
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createErrorResponse(
      "Service or token not found",
      {
        serviceNotFound: {
          summary: "Service not found",
          code: "SERVICE_NOT_FOUND",
          details: "Service not found",
        },
        tokenNotFound: {
          summary: "Token not found",
          code: "TOKEN_NOT_FOUND",
          details: "Token not found",
        },
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const rotateServiceTokenDoc = describeRoute({
  description: "Rotate a service token and generates a new secret in-place.",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Service token rotated", {
      details: "Service token rotated successfully",
      dataSchema: ServiceTokenSelectSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidServiceOrTokenID: {
        summary: "Invalid service or token ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields({
          serviceId: "Invalid UUID",
          tokenId: "Invalid UUID",
        }),
        fields: {
          serviceId: "Invalid UUID",
          tokenId: "Invalid UUID",
        },
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createErrorResponse(
      "Service or token not found",
      {
        serviceNotFound: {
          summary: "Service not found",
          code: "SERVICE_NOT_FOUND",
          details: "Service not found",
        },
        tokenNotFound: {
          summary: "Token not found",
          code: "TOKEN_NOT_FOUND",
          details: "Token not found",
        },
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});
