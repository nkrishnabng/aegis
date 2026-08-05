import fs from "node:fs/promises";
import path from "node:path";
import type { ScreenshotRecord } from "@testingmcp/shared";
import { env } from "../env";
import { mcpManager } from "../mcp/mcpManager";
import { prisma } from "../db/client";
import { serializeScreenshot } from "../db/serializers";
import { logger } from "../utils/logger";

export async function captureScreenshot(
  sessionKey: string,
  testRunResultId: string,
  stepOrder: number,
): Promise<ScreenshotRecord | null> {
  try {
    const result = await mcpManager.callTool(sessionKey, "browser_take_screenshot", {
      type: "png",
    });
    const imageBlock = result.content.find((b) => b.type === "image" && b.data);
    if (!imageBlock?.data) {
      logger.warn(`executor: browser_take_screenshot returned no image for step ${stepOrder}`);
      return null;
    }

    await fs.mkdir(env.screenshotsDir, { recursive: true });
    const fileName = `${testRunResultId}-step${stepOrder}.png`;
    const filePath = path.join(env.screenshotsDir, fileName);
    await fs.writeFile(filePath, Buffer.from(imageBlock.data, "base64"));

    const record = await prisma.screenshot.create({
      data: {
        testRunResultId,
        stepOrder,
        // Store a relative, web-servable path; the API exposes these under /screenshots/*.
        filePath: fileName,
      },
    });
    return serializeScreenshot(record);
  } catch (err) {
    logger.warn(`executor: failed to capture screenshot for step ${stepOrder}: ${(err as Error).message}`);
    return null;
  }
}
