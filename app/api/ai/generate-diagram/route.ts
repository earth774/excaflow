import { NextRequest, NextResponse } from "next/server";
import { openai, getModelName, isOpenAIConfigured } from "@/lib/openai";

// System prompt for Excalidraw elements structure
const EXCALIDRAW_SYSTEM_PROMPT = `You are an expert system architect and UI designer specialized in creating Excalidraw diagrams.
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

// System prompt for Mermaid syntax
const MERMAID_SYSTEM_PROMPT = `You are an expert system architect specialized in creating Mermaid diagrams.
Your goal is to generate clear, logical, and well-structured diagrams using Mermaid syntax based on user descriptions.

### MERMAID DIAGRAM TYPES
Choose the most appropriate diagram type based on the user's request:
- **Flowchart**: For processes, workflows, and decision trees
- **Sequence Diagram**: For interactions between entities over time
- **Class Diagram**: For object-oriented structures and relationships
- **State Diagram**: For state machines and transitions
- **ER Diagram**: For database relationships
- **Gantt Chart**: For project schedules and timelines
- **Pie Chart**: For data distribution
- **Git Graph**: For version control branching

### FLOWCHART SYNTAX (Most Common)
\`\`\`mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great]
    B -->|No| D[Debug]
    D --> E[Test Again]
    E --> B
    C --> F[End]
\`\`\`

**Node Shapes**:
- \`[Text]\` - Rectangle (for processes)
- \`{Text}\` - Diamond (for decisions)
- \`([Text])\` - Stadium/Pill shape (for start/end)
- \`[(Text)]\` - Cylinder (for databases)
- \`((Text))\` - Circle
- \`[\\Text/]\` - Trapezoid

**Flow Directions**:
- TD (Top Down), TB (Top to Bottom)
- BT (Bottom to Top)
- LR (Left to Right)
- RL (Right to Left)

**Connections**:
- \`-->\` - Arrow
- \`---\` - Line
- \`-.->\` - Dotted arrow
- \`==>\` - Thick arrow
- \`-->|Text|\` - Arrow with label

### SEQUENCE DIAGRAM SYNTAX
\`\`\`mermaid
sequenceDiagram
    participant A as User
    participant B as Server
    A->>B: Request
    B-->>A: Response
\`\`\`

### CLASS DIAGRAM SYNTAX
\`\`\`mermaid
classDiagram
    class Animal {
        +name: string
        +age: int
        +makeSound()
    }
    Animal <|-- Dog
\`\`\`

### OUTPUT FORMAT
Return a JSON object with:
\`\`\`json
{
  "mermaid": "flowchart TD\\n    A[Start] --> B[End]",
  "type": "flowchart"
}
\`\`\`

### CRITICAL RULES FOR TEXT LABELS:
1. **USE DOUBLE QUOTES** for all labels - e.g., \`id["Label Text"]\`
2. **Newlines ARE allowed** inside quotes - use \`\\n\` for line breaks
3. **Escape quotes** inside labels if needed - e.g., \`"Say \\"Hello\\""\`
4. **Use simple IDs** - Like A, B, C or start, login, success
5. **Proper indentation** - 4 spaces per level
6. **Use \\n for newlines** in JSON response (between nodes)

### RESERVED KEYWORDS - DO NOT USE AS NODE IDs:
**CRITICAL:** These words are reserved in Mermaid and CANNOT be used as node IDs:
- ❌ \`end\` - Use \`finish\`, \`done\`, \`complete\`, \`final\` instead
- ❌ \`graph\`, \`subgraph\`, \`style\`, \`class\`, \`click\`
- ❌ \`direction\`, \`flowchart\`

### EXAMPLE - Good vs Bad:
❌ BAD: \`start(Start Process)\` (no quotes, might break with special chars)
✅ GOOD: \`start["Start Process"]\`

❌ BAD: \`login[Login\nPage]\` (newlines without quotes might fail)
✅ GOOD: \`login["Login\nPage"]\`

❌ BAD: \`end["End"]\` (reserved keyword ID)
✅ GOOD: \`finish["End"]\`

### COMPLEX EXAMPLE (Follow this style):
\`\`\`mermaid
flowchart TD
    Start["Start Flow"] --> Input["Receive Data\n(Name, ID, Date)"]
    Input --> Check{"Check Data\nIs it valid?"}
    Check -->|No| Error["Show Error\nInvalid Input"]
    Error --> End["End Process"]
    Check -->|Yes| Process["Process Data\nSave to DB"]
    Process --> Success["Success"]
    Success --> End
\`\`\`

Generate clean, professional Mermaid syntax.
REMEMBER: Always wrap label text in double quotes \`["Like This"]\`.`;

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
    const { prompt, format = "excalidraw" } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Validate format parameter
    if (format !== "excalidraw" && format !== "mermaid") {
      return NextResponse.json(
        { error: "Format must be either 'excalidraw' or 'mermaid'" },
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

    // STRATEGY: Always generate Mermaid syntax first for better symmetry
    // Then convert to Excalidraw if needed
    const systemPrompt = MERMAID_SYSTEM_PROMPT;
    const userMessage = `Generate a Mermaid diagram for: ${sanitizedPrompt}`;

    // Detect reasoning models (o1, gpt-5, etc.) - they have different requirements
    const modelName = getModelName();
    const isReasoningModel = modelName.startsWith("o1") || modelName.startsWith("gpt-5");
    
    // Reasoning models need different handling:
    // - Don't support system messages (must use user messages only)
    // - Don't support response_format
    // - Need MORE tokens (reasoning tokens + output tokens)
    const messages = isReasoningModel 
      ? [
          {
            role: "user" as const,
            content: `${systemPrompt}\n\n---\n\n${userMessage}`,
          },
        ]
      : [
          {
            role: "system" as const,
            content: systemPrompt,
          },
          {
            role: "user" as const,
            content: userMessage,
          },
        ];

    // Build API call parameters
    const apiParams: any = {
      model: modelName,
      messages,
      // Reasoning models need 10-20x more tokens (they use tokens for thinking)
      max_completion_tokens: isReasoningModel ? 32000 : 4000,
    };

    // Only add response_format if NOT a reasoning model
    if (!isReasoningModel) {
      apiParams.response_format = { type: "json_object" };
    }

    // Call OpenAI API
    console.log(`Calling OpenAI with model: ${modelName} (reasoning: ${isReasoningModel})`);
    const completion = await openai.chat.completions.create(apiParams);

    console.log("OpenAI response received:", {
      hasChoices: !!completion.choices,
      choicesLength: completion.choices?.length,
      hasMessage: !!completion.choices?.[0]?.message,
      hasContent: !!completion.choices?.[0]?.message?.content,
      contentLength: completion.choices?.[0]?.message?.content?.length,
      finishReason: completion.choices?.[0]?.finish_reason,
      usage: completion.usage,
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      console.error("No response content from OpenAI. Full response:", JSON.stringify(completion, null, 2));
      return NextResponse.json(
        { 
          error: "No response from OpenAI",
          details: {
            finishReason: completion.choices?.[0]?.finish_reason,
            hasChoices: !!completion.choices,
            choicesLength: completion.choices?.length,
          }
        },
        { status: 500 }
      );
    }

    // Parse the Mermaid response
    let mermaidSyntax: string;
    let diagramType: string;
    
    try {
      const parsed = JSON.parse(responseContent);
      
      if (!parsed || typeof parsed !== "object" || !("mermaid" in parsed)) {
        throw new Error("Response does not contain mermaid syntax");
      }

      mermaidSyntax = parsed.mermaid;
      diagramType = parsed.type || "flowchart";
      
      console.log("Mermaid syntax generated:", mermaidSyntax.substring(0, 200) + "...");
    } catch (parseError) {
      console.error("Error parsing Mermaid response:", parseError);
      console.error("Response content:", responseContent);
      return NextResponse.json(
        { error: "Invalid Mermaid response from AI", details: String(parseError) },
        { status: 500 }
      );
    }

    // If user requested Mermaid format, return it directly
    if (format === "mermaid") {
      return NextResponse.json({
        mermaid: mermaidSyntax,
        type: diagramType,
        format: "mermaid",
        success: true,
      });
    }

    // For Excalidraw format, return Mermaid syntax for CLIENT-SIDE conversion
    // (parseMermaidToExcalidraw requires DOM which isn't available in API routes)
    return NextResponse.json({
      mermaid: mermaidSyntax,
      type: diagramType,
      format: "excalidraw",
      convertOnClient: true, // Signal to client to convert
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

