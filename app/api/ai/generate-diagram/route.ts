import { NextRequest, NextResponse } from "next/server";
import { openai, getModelName, isOpenAIConfigured } from "@/lib/openai";

// System prompt that explains Excalidraw elements structure
// System prompt with Grid-Based Layout and Chain of Thought
// System prompt with Grid-Based Layout and Chain of Thought
const SYSTEM_PROMPT = `You are an expert system architect and UI designer specialized in creating Excalidraw diagrams.
Your goal is to generate clear, logical, and visually organized flowcharts based on user descriptions.

### CORE METHODOLOGY: GRID-BASED LAYOUT
Do NOT think in pixels. Think in a VIRTUAL GRID where:
- Each "cell" is 200x150 units (Width x Height).
- Grid coordinates (row, col) map to pixels:
  - x = col * 240 + 100 (Horizontal spacing - Compact)
  - y = row * 160 + 100 (Vertical spacing - Compact)
- Standard Shape Size: width=160, height=80.

### PROCESS (CHAIN OF THOUGHT)
1. **ANALYZE**: Identify the key steps, decisions, and flow from the user's prompt.
2. **PLAN**: Assign each step to a logical (row, col) coordinate.
   - Start at (0, 0) or (0, 1).
   - Flow downwards (row + 1) for sequence.
   - Flow sideways (col - 1, col + 1) for branches/alternatives.
   - Ensure "Yes" and "No" paths from decisions are visually distinct.
3. **GENERATE**: Convert the plan into the JSON format below.

### SHAPE RULES
- **Process/Step**: Use "rectangle".
- **Decision/Condition**: Use "diamond".
- **Start/End**: Use "ellipse".
- **Database/Storage**: Use "cylinder" (if available) or "rectangle" with specific styling.
- **Connections**: Use "arrow" to connect shapes.
  - **CRITICAL**: Arrows MUST use "binding" to attach to shapes.
  - **CRITICAL**: Arrow points are RELATIVE to the start position.
- **Text**:
  - Text MUST be a separate element.
  - Text MUST be perfectly centered inside its container shape.
  - Font size: 20px (Small), 28px (Medium/Standard).

### JSON OUTPUT FORMAT
Return a SINGLE JSON object with an "elements" array.
Each element must follow this structure:

\`\`\`json
{
  "type": "rectangle" | "diamond" | "ellipse" | "arrow" | "text",
  "id": "unique_id",
  "x": number, // Calculated from grid
  "y": number, // Calculated from grid
  "width": number,
  "height": number,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "hachure",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roundness": { "type": 3 },
  "text": "Label Content", // For text elements ONLY
  
  // ARROW SPECIFIC PROPERTIES (CRITICAL)
  "startBinding": { "elementId": "source_id", "focus": 0.5, "gap": 1 },
  "endBinding": { "elementId": "target_id", "focus": 0.5, "gap": 1 },
  "points": [[0, 0], [dx, dy]] // Relative points! [0,0] is the start, [dx,dy] is the end relative to start
}
\`\`\`

### CRITICAL RULES FOR ARROWS
1. **Start Position**: Set arrow.x and arrow.y to the **exact center** of the source shape.
   - arrow.x = source.x + source.width/2
   - arrow.y = source.y + source.height/2
2. **End Position**: Calculate the difference (dx, dy) to the **exact center** of the target shape.
   - dx = (target.x + target.width/2) - arrow.x
   - dy = (target.y + target.height/2) - arrow.y
3. **Points**: ALWAYS use \`[[0, 0], [dx, dy]]\`.
4. **Binding**: ALWAYS include \`startBinding\` (source ID) and \`endBinding\` (target ID).

### CRITICAL RULES FOR TEXT
- Text elements are INDEPENDENT. They are NOT properties of the shape.
- To center text in a shape at (shapeX, shapeY) with size (W, H):
  - Estimate text width (approx 10px per char).
  - textX = shapeX + (W/2) - (textWidth/2)
  - textY = shapeY + (H/2) - (fontSize/2)
  - textAlign: "center", verticalAlign: "middle"

### EXAMPLE: "Login Flow"
1. Start (0, 1) -> "ellipse" id="start"
2. Input (1, 1) -> "rectangle" id="input"
   - Arrow from "start" to "input":
     - x = start.center.x, y = start.center.y
     - dx = input.center.x - start.center.x, dy = input.center.y - start.center.y
     - points = [[0, 0], [dx, dy]]
     - startBinding: { elementId: "start" }, endBinding: { elementId: "input" }

Generate the JSON for the user's request. Focus on LOGICAL FLOW, ALIGNMENT, and CONNECTIVITY.`;

export async function POST(request: NextRequest) {
  try {
    // Check if OpenAI is configured
    if (!isOpenAIConfigured() || !openai) {
      return NextResponse.json(
        { error: "OpenAI API is not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Sanitize prompt (basic validation)
    const trimmedPrompt = prompt.trim();
    const sanitizedPrompt = trimmedPrompt ? trimmedPrompt.slice(0, 1000) : ""; // Limit to 1000 characters
    
    if (!sanitizedPrompt) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: getModelName(),
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Generate an Excalidraw diagram for: ${sanitizedPrompt}`,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent, structured flowcharts
      max_tokens: 4000, // More tokens for complex flowcharts with text labels
      response_format: { type: "json_object" }, // Force JSON response
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    // Parse JSON response
    let elements;
    try {
      const parsed = JSON.parse(responseContent);
      // Handle JSON object with "elements" key (required for json_object format)
      if (parsed && typeof parsed === "object" && "elements" in parsed) {
        elements = parsed.elements;
      } else if (Array.isArray(parsed)) {
        // Fallback: if it's already an array
        elements = parsed;
      } else {
        throw new Error("Response does not contain elements array");
      }
      
      if (!Array.isArray(elements)) {
        throw new Error("Response elements is not an array");
      }
    } catch (parseError) {
      console.error("Error parsing OpenAI response:", parseError);
      console.error("Response content:", responseContent);
      return NextResponse.json(
        { error: "Invalid JSON response from AI", details: String(parseError) },
        { status: 500 }
      );
    }

    // Validate and sanitize elements
    if (!elements || !Array.isArray(elements)) {
      return NextResponse.json(
        { error: "Invalid elements array in response" },
        { status: 500 }
      );
    }

    const sanitizedElements = (elements || [])
      .filter((el: unknown) => el && typeof el === "object" && el !== null)
      .map((el: Record<string, unknown>, index: number) => {
        // Ensure required fields exist
        return {
          id: el.id || `element-${index + 1}`,
          type: el.type || "rectangle",
          x: typeof el.x === "number" ? el.x : 100 + index * 50,
          y: typeof el.y === "number" ? el.y : 100 + index * 50,
          width: typeof el.width === "number" ? Math.max(50, el.width) : 100,
          height: typeof el.height === "number" ? Math.max(50, el.height) : 100,
          angle: typeof el.angle === "number" ? el.angle : 0,
          strokeColor: el.strokeColor || "#1e1e1e",
          backgroundColor: el.backgroundColor || "transparent",
          fillStyle: el.fillStyle || "solid",
          strokeWidth: typeof el.strokeWidth === "number" ? el.strokeWidth : 2,
          strokeStyle: el.strokeStyle || "solid",
          roughness: typeof el.roughness === "number" ? el.roughness : 1,
          opacity: typeof el.opacity === "number" ? el.opacity : 100,
          versionNonce: el.versionNonce || Math.floor(Math.random() * 1000000),
          ...(el.type === "text" && { 
            text: el.text || "", 
            fontSize: el.fontSize || 20,
            textAlign: el.textAlign || "center",
            verticalAlign: el.verticalAlign || "middle",
            fontFamily: typeof el.fontFamily === "number" ? el.fontFamily : 1
          }),
          ...(el.type === "arrow" || el.type === "line" || el.type === "freedraw" 
            ? { points: Array.isArray(el.points) ? el.points : [[0, 0], [100, 100]] }
            : {}),
        };
      })
      .slice(0, 50); // Limit to 50 elements max

    return NextResponse.json({
      elements: sanitizedElements,
      success: true,
    });
  } catch (error: unknown) {
    console.error("Error generating diagram:", error);
    
    // Handle OpenAI API errors
    if (error && typeof error === "object" && "status" in error) {
      const apiError = error as { status: number };
      if (apiError.status === 401) {
        return NextResponse.json(
          { error: "Invalid OpenAI API key" },
          { status: 401 }
        );
      }
      
      if (apiError.status === 429) {
        return NextResponse.json(
          { error: "OpenAI API rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }
    }

    const errorMessage = error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);

    return NextResponse.json(
      { error: "Failed to generate diagram", details: errorMessage },
      { status: 500 }
    );
  }
}

