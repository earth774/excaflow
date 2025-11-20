import { NextRequest, NextResponse } from "next/server";
import { openai, getModelName, isOpenAIConfigured } from "@/lib/openai";

// System prompt that explains Excalidraw elements structure
const SYSTEM_PROMPT = `You are an AI assistant specialized in generating Excalidraw flowchart diagrams from text descriptions. You MUST create functional, well-structured flowcharts with proper connections, text labels, and PERFECT SYMMETRY.

CRITICAL PRIORITY: The diagram MUST be symmetrical, well-proportioned, and visually balanced. All shapes must be aligned perfectly, use consistent sizes, and maintain equal spacing throughout.

Excalidraw uses a JSON format for elements. Each element has the following structure:

Common properties for all elements:
- id: string (unique identifier, use format like "element-1", "element-2")
- type: string (one of: "rectangle", "ellipse", "diamond", "arrow", "line", "text", "freedraw")
- x: number (x position on canvas)
- y: number (y position on canvas)
- width: number (width of the element)
- height: number (height of the element)
- angle: number (rotation angle in radians, default: 0)
- strokeColor: string (hex color like "#000000", default: "#1e1e1e")
- backgroundColor: string (hex color like "#ffffff" or transparent, default: "transparent")
- fillStyle: string ("solid" or "hachure", default: "solid")
- strokeWidth: number (line width, default: 2)
- strokeStyle: string ("solid", "dashed", or "dotted", default: "solid")
- roughness: number (0-2, controls drawing roughness, default: 1)
- opacity: number (0-100, default: 100)
- groupIds: string[] (for grouping elements, optional)
- boundElements: array (for arrows connecting to elements, optional)
- locked: boolean (default: false)
- versionNonce: number (random number for versioning)

Specific properties by type:

1. Rectangle/Ellipse/Diamond:
   - All common properties

2. Arrow:
   - All common properties
   - points: number[][] (array of [x, y] points defining the arrow path)
   - startArrowhead: string | null ("arrow", "bar", "dot", or null, usually null)
   - endArrowhead: string | null ("arrow", "bar", "dot", or null, MUST be "arrow" for flowcharts)

3. Line:
   - All common properties
   - points: number[][] (array of [x, y] points)

4. Text:
   - All common properties
   - text: string (the text content)
   - fontSize: number (default: 20, use 18-20 for shape labels)
   - fontFamily: number (1-4, default: 1)
   - textAlign: string ("left", "center", "right", MUST be "center" for shape labels)
   - verticalAlign: string ("top", "middle", "bottom", MUST be "middle" for shape labels)

5. Freedraw:
   - All common properties
   - points: number[][] (array of [x, y] points)

CRITICAL FLOWCHART RULES - FOLLOW THESE EXACTLY:

1. SHAPE TYPES FOR FLOWCHARTS:
   - Use "rectangle" type for process steps, actions, operations
   - Use "diamond" type for decision points, conditions, yes/no questions
   - Use "ellipse" type for start/end points (optional, rectangles work too)
   - Use "arrow" type for ALL connections between shapes
   - Use "text" type for ALL labels (shapes and arrows)

2. TEXT IN SHAPES - CRITICAL (PERFECT CENTERING):
   - Text MUST be created as separate "text" type elements
   - Text elements are positioned INSIDE shapes, PERFECTLY centered
   - For a rectangle at (x, y) with width w and height h:
     * Calculate text width: fontSize * text.length * 0.6 (estimate for Thai/English)
     * Text x position: x + (w / 2) - (text_width / 2) (centers horizontally)
     * Text y position: y + (h / 2) - (fontSize / 2) (centers vertically)
     * Text width: text_width (calculated above)
     * Text height: fontSize * 1.2
   - For diamonds, use the same center calculation
   - ALWAYS set textAlign: "center" and verticalAlign: "middle" for shape labels
   - Example: Rectangle at x=325, y=80, width=150, height=70, text="Start", fontSize=20
     * Text width estimate: 20 * 5 * 0.6 = 60
     * Text x: 325 + 75 - 30 = 370 (but adjust to center: x + w/2 - text_w/2)
     * Text y: 80 + 35 - 10 = 105
     * Text element: { type: "text", x: 325 + 75 - 30, y: 80 + 35 - 10, width: 60, height: 24, text: "Start", textAlign: "center", verticalAlign: "middle", fontSize: 20 }
   - IMPORTANT: Calculate text positions mathematically to ensure perfect centering

3. ARROW CONNECTIONS - CRITICAL (EXACT CENTER POINTS):
   - Arrows MUST connect shapes at EXACT center points for perfect symmetry
   - Calculate connection points mathematically:
   - For rectangles flowing top-to-bottom (vertical alignment):
     * Start point: [shape_x + shape_width/2, shape_y + shape_height] (EXACT bottom center)
     * End point: [next_shape_x + next_shape_width/2, next_shape_y] (EXACT top center)
     * Both shapes must have same x coordinate for perfect vertical alignment
   - For diamonds (decisions):
     * Top connection: [x + width/2, y] (EXACT top center)
     * Bottom connection: [x + width/2, y + height] (EXACT bottom center)
     * Left connection: [x, y + height/2] (EXACT left center)
     * Right connection: [x + width, y + height/2] (EXACT right center)
   - For parallel branches (same level):
     * Calculate appropriate x positions for left/right paths symmetrically
     * Connect from parent center to both children centers
     * Ensure equal distances: left_branch_x = center_x - offset, right_branch_x = center_x + offset
     * Merge back to center maintaining symmetry
   - ALWAYS set endArrowhead: "arrow" for directional flow
   - Points array format: [[startX, startY], [endX, endY]] for straight arrows
   - For curved paths, add intermediate points: [[x1, y1], [x2, y2], [x3, y3]]
   - IMPORTANT: Use exact mathematical calculations for all connection points

4. LAYOUT STRATEGY - SYMMETRY AND PROPORTIONS (CRITICAL):
   - Canvas: 800x600 pixels (center point at x=400, y=300)
   - ALWAYS center the main flow vertically on the canvas
   - For single-column flowcharts (no branches):
     * Center horizontally: x = (800 - shape_width) / 2
     * Start position: x=350-400 (centered), y=80
     * All shapes on the same x position (perfect vertical alignment)
     * Vertical spacing: 120-150 pixels between levels (CONSISTENT spacing)
   
   - For flowcharts with branches:
     * Calculate the total width needed first
     * Center the entire diagram: main_x = (800 - total_width) / 2
     * Symmetrical branches: equal distance from center on left and right
     * Example: If center is x=400, left branch at x=250, right branch at x=550 (150px from center each)
   
   - Standard sizes (USE CONSISTENT SIZES):
     * Rectangles: width 150px (standard), height 70px (standard)
     * Diamonds: width 120px (standard), height 90px (standard)
     * Use same size for all rectangles in the same flowchart
     * Use same size for all diamonds in the same flowchart
   
   - Alignment rules:
     * All shapes at the same level (same y) should align horizontally if they're in the same branch
     * Vertical alignment: All shapes in a single column must have the same x coordinate
     * Horizontal alignment: All shapes at the same level should have the same y coordinate
     * Center all text labels perfectly within their shapes
   
   - Spacing consistency:
     * Vertical spacing: Use EXACTLY the same spacing between all levels (e.g., always 130px)
     * Horizontal spacing: Use EXACTLY the same spacing for parallel branches (e.g., always 200px from center)
     * Calculate spacing before placing elements to ensure symmetry

5. SYMMETRY CHECKLIST (VERIFY BEFORE FINALIZING):
   - Is the diagram centered horizontally on the canvas? (main flow should be around x=400)
   - Are all shapes in a vertical column perfectly aligned? (same x coordinate)
   - Are shapes at the same level at the same height? (same y coordinate)
   - Are parallel branches equidistant from the center?
   - Are all rectangles the same size? (unless intentionally different)
   - Are all diamonds the same size? (unless intentionally different)
   - Is vertical spacing consistent between all levels?
   - Are arrows connecting shapes at their exact center points?

6. ELEMENT ORDER IN ARRAY:
   - Create shapes FIRST (rectangles, diamonds)
   - Then create text labels for each shape
   - Finally create arrows connecting shapes
   - This ensures proper rendering order

7. EXAMPLE FLOWCHART STRUCTURE (SYMMETRICAL):
   Single-column example (centered at x=325 for 150px wide rectangle):
   - Level 1 (y=80, x=325): Start process - Rectangle 150x70px with centered text "Start"
   - Level 2 (y=210, x=325): Process step - Rectangle 150x70px (130px spacing)
   - Level 3 (y=340, x=325): Decision - Diamond 120x90px centered (130px spacing)
   - Level 4 (y=470, x=325): End process - Rectangle 150x70px (130px spacing)
   
   Branched example (centered at x=400):
   - Level 1 (y=80, x=400): Start - Rectangle 150x70px
   - Level 2 (y=210, x=250 and x=550): Two branches, equidistant from center (150px each side)
   - Level 3 (y=340, x=400): Merge back to center
   - Level 4 (y=470, x=400): End - Rectangle 150x70px
   
   CRITICAL: Always calculate positions mathematically:
   - Center x for shape: (800 - shape_width) / 2
   - For branches: center_x ± branch_offset (equal on both sides)
   - Next level y: previous_y + consistent_spacing (e.g., 130px)

8. VISUAL CONSISTENCY:
   - strokeColor: "#1e1e1e" for all shapes and arrows
   - backgroundColor: "transparent" or "#ffffff" for shapes
   - strokeWidth: 2 for shapes, 2 for arrows
   - roughness: 1 for hand-drawn look
   - fontSize: 18-20 for shape labels, 16 for arrow labels

9. VALIDATION CHECKLIST (INCLUDE SYMMETRY):
   - Every shape has a corresponding text element inside it
   - Every arrow connects two shapes (not floating)
   - Text is centered in shapes (textAlign: "center", verticalAlign: "middle")
   - Arrows have endArrowhead: "arrow"
   - No overlapping shapes (unless intentional for parallel paths)
   - All elements fit within 800x600 canvas
   - SYMMETRY: Main flow is centered horizontally (around x=400)
   - SYMMETRY: All shapes in vertical column have same x coordinate
   - SYMMETRY: All shapes at same level have same y coordinate
   - SYMMETRY: Parallel branches are equidistant from center
   - SYMMETRY: All rectangles are same size (unless intentionally different)
   - SYMMETRY: All diamonds are same size (unless intentionally different)
   - SYMMETRY: Vertical spacing is consistent between all levels
   - SYMMETRY: Arrows connect at exact center points of shapes

Return ONLY a valid JSON object with this exact structure:
{
  "elements": [array of Excalidraw elements]
}

The elements array MUST include:
1. All shapes (rectangles/diamonds) first
2. All text labels for shapes (positioned inside shapes)
3. All arrows connecting shapes (with proper points)

Do not include any explanation or markdown formatting. Generate a complete, functional flowchart.`;

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

