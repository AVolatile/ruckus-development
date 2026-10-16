import {
  eventDefinitionSchema,
  type EventDefinition,
  type EventRecord,
} from "../../shared/events";
import { useRevisionDraft } from "../lib/useRevisionDraft";
const options = {
  field: "definition" as const,
  resource: "events",
  cacheNamespace: "event",
  schema: eventDefinitionSchema,
  conflictCode: "EVENT_CONFLICT",
  label: "event",
};
export function useEventDraft(workspaceId: string, id: string | undefined) {
  return useRevisionDraft<EventDefinition, "definition", EventRecord>(
    workspaceId,
    id,
    options,
  );
}
export function exportEvent(definition: EventDefinition) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(definition, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "ruckus-event.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
