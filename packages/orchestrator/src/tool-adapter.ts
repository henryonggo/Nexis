import { zodToJsonSchema } from "zod-to-json-schema";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = import("@nexis/agent-tools").ToolDefinition<any, any>;

/**
 * Adapt the agent-tools registry to Anthropic tool definitions. The driver
 * never defines tool behavior — the registry is the single source of truth
 * (ADR 0004); this only reshapes zod schemas into JSON Schema for the API.
 */
export interface AnthropicToolParam {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export function toAnthropicTools(tools: readonly AnyTool[]): AnthropicToolParam[] {
  return tools.map((tool) => {
    const schema = zodToJsonSchema(tool.input, {
      $refStrategy: "none",
      target: "jsonSchema7",
    }) as Record<string, unknown>;
    // The API expects a bare object schema; zod-to-json-schema adds a $schema
    // header that is harmless but noisy — drop it.
    delete schema.$schema;
    return {
      name: tool.name,
      description: tool.requiresApproval
        ? `${tool.description} Requires an owner-approved token; without one the call is denied and an approval request is opened.`
        : tool.description,
      input_schema: schema,
    };
  });
}
