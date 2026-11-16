import { apiPost } from "./apiClient";

export async function sendCopilotMessage({
  regionId,
  message,
  history = [],
  signal,
}) {
  if (!regionId) {
    throw new Error("Please select a region first.");
  }

  const { data } = await apiPost(
    "/api/ai/chat",
    {
      regionId,
      message,
      history,
    },
    { signal }
  );

  return data;
}