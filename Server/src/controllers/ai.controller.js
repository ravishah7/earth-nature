import { askEarthCopilot } from "../services/ai/earthCopilot.service.js";
import { sendOk, HttpError } from "../utils/response.js";
import { parseRegionId } from "../utils/validators.js";

export async function chat(req, res, next) {
  try {
    const { regionId, message, history = [] } = req.body ?? {};

    const validRegionId = parseRegionId(regionId);

    if (typeof message !== "string" || !message.trim()) {
      throw new HttpError(400, "INVALID_MESSAGE", "Please enter a question.");
    }

    if (message.length > 2000) {
      throw new HttpError(400, "MESSAGE_TOO_LONG", "Question must be under 2000 characters.");
    }

    if (!Array.isArray(history) || history.length > 8) {
      throw new HttpError(400, "INVALID_HISTORY", "Conversation history is invalid.");
    }

    const safeHistory = history.map((item) => {
      if (
        !item ||
        !["user", "assistant"].includes(item.role) ||
        typeof item.content !== "string" ||
        item.content.length > 2000
      ) {
        throw new HttpError(400, "INVALID_HISTORY", "A conversation message is invalid.");
      }

      return {
        role: item.role,
        content: item.content,
      };
    });

    const result = await askEarthCopilot({
      regionId: validRegionId,
      message: message.trim(),
      history: safeHistory,
    });

    sendOk(res, result);
  } catch (error) {
    if (error.status && error.code) {
      return next(
        new HttpError(error.status, error.code, error.message)
      );
    }

    next(error);
  }
}