import { NextRequest, NextResponse } from "next/server";
import { openai, getModelName, isOpenAIConfigured } from "@/lib/openai";

// Helper function to clean and validate Mermaid syntax
function cleanAndValidateMermaidSyntax(syntax: string): string {
  let cleaned = syntax.trim();
  
  // Remove any markdown code blocks if present
  cleaned = cleaned.replace(/^```mermaid\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/g, '');
  
  // Split into lines for processing
  const lines = cleaned.split('\n');
  const cleanedLines: string[] = [];
  
  // Check if this is a sequence diagram
  const isSequenceDiagram = lines.some(line => line.trim().startsWith('sequenceDiagram'));
  
  // Track node ID mappings for fixing invalid IDs
  const nodeIdMap = new Map<string, string>();
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      cleanedLines.push('');
      continue;
    }
    
    // Skip comment lines
    if (line.startsWith('%%')) {
      continue;
    }
    
    // For Sequence Diagrams, we need less aggressive validation
    if (isSequenceDiagram) {
      // Just ensure basic syntax validity without renaming nodes
      // Sequence diagrams use "Participant A" or "A->B: Message" syntax which is different
      cleanedLines.push(line);
      continue;
    }
    
    // Fix node definitions that start with numbers or have invalid characters
    // Pattern: nodeId[ or nodeId{ or nodeId(
    // Node IDs must start with a letter or underscore, not a number
    line = line.replace(/(\b)(\d+)([A-Za-z_]\w*)\s*([\[\(\{])/g, (match, before, num, rest, bracket) => {
      // If node ID starts with number, prefix it with a letter
      const newId = `N${num}${rest}`;
      nodeIdMap.set(`${num}${rest}`, newId);
      return `${before}${newId}${bracket}`;
    });
    
    // Fix node IDs that are just numbers
    line = line.replace(/\b(\d+)\s*([\[\(\{])/g, (match, num, bracket) => {
      const newId = `N${num}`;
      nodeIdMap.set(num, newId);
      return `${newId}${bracket}`;
    });
    
    // Fix node references in arrows (replace old IDs with new ones)
    nodeIdMap.forEach((newId, oldId) => {
      // Replace in arrow definitions: oldId --> or --> oldId
      const arrowPattern = new RegExp(`(^|\\s|-->|--|-)${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|-->|--|-|$)`, 'g');
      line = line.replace(arrowPattern, `$1${newId}$2`);
    });
    
    // Remove any invalid characters that might cause parse errors
    // Keep only valid Mermaid syntax characters
    // But be careful not to break valid syntax
    
    // Fix malformed node definitions with dashes, numbers, or special chars
    // Pattern: Start[------------------- or Start[123 or Start[ "text" should become Start["Label"]
    // First, handle cases where bracket content is malformed (dashes, numbers alone, etc.)
    line = line.replace(/(\w+)\[([^\]]*?)(?=\]|$)/g, (match, nodeId, content) => {
      // Skip if already properly formatted with quotes
      if (content.includes('"') && content.match(/^["'].*["']$/)) {
        return match;
      }
      
      // If content is just dashes, numbers, or whitespace, use nodeId as label
      const trimmedContent = content.trim();
      if (!trimmedContent || 
          trimmedContent.match(/^-+$/) || 
          trimmedContent.match(/^\d+$/) ||
          trimmedContent.match(/^[-_\s]+$/)) {
        return `${nodeId}["${nodeId}"]`;
      }
      
      // If content doesn't have quotes but has text, add quotes
      if (!content.includes('"') && trimmedContent.length > 0) {
        // Remove any trailing dashes or numbers that might be artifacts
        const cleanContent = trimmedContent.replace(/[-_\s]+$/, '').replace(/^\d+/, '');
        if (cleanContent.length > 0) {
          return `${nodeId}["${cleanContent}"]`;
        } else {
          return `${nodeId}["${nodeId}"]`;
        }
      }
      
      return match;
    });
    
    // Fix unclosed brackets (node definitions that don't end with ])
    line = line.replace(/(\w+)\[([^\]]*)$/, (match, nodeId, content) => {
      // Only fix if the line doesn't already have a closing bracket somewhere
      if (!line.includes(']') && content && content.trim().length > 0) {
        const cleanContent = content.trim().replace(/[-_\s]+$/, '');
        if (cleanContent.length > 0 && !cleanContent.match(/^-+$/)) {
          return `${nodeId}["${cleanContent}"]`;
        } else {
          return `${nodeId}["${nodeId}"]`;
        }
      }
      return match;
    });
    
    // Remove any lines with only dashes or invalid patterns
    if (line.match(/^-+$/) || line.match(/^\s*[0-9\s-]+\s*$/)) {
      continue;
    }
    
    cleanedLines.push(line);
  }
  
  cleaned = cleanedLines.join('\n').trim();
  
  // Final validation: ensure we have a valid diagram type declaration
  if (!cleaned.match(/^(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)\s+/i)) {
    // If missing, try to prepend flowchart TD
    if (cleaned.length > 0 && !cleaned.startsWith('flowchart') && !cleaned.startsWith('sequence')) {
      cleaned = `flowchart TD\n${cleaned}`;
    }
  }
  
  return cleaned;
}

// System prompt for Mermaid syntax
// Note: We use Mermaid syntax and convert to Excalidraw on the client side
// The EXCALIDRAW_SYSTEM_PROMPT is not used anymore as we use the Mermaid -> Excalidraw pipeline
const MERMAID_SYSTEM_PROMPT = `You are an expert system architect specialized in creating Mermaid diagrams.
Your goal is to generate clear, logical, and well-structured diagrams using Mermaid syntax based on user descriptions.

### CRITICAL REQUIREMENT: EVERY NODE/INTERACTION MUST HAVE A LABEL
- **Flowcharts**: Every node must have a label in quotes (e.g., \`id["Label"]\`)
- **Sequence Diagrams**: Every interaction must have a message text (e.g., \`A->>B: Message\`)
- Labels should be derived directly from the user's description
- Labels must be meaningful and descriptive
- Labels should be in the same language as the user's prompt (Thai or English)

### MERMAID DIAGRAM TYPES
Choose the most appropriate diagram type based on the user's request:
- **Flowchart**: For processes, workflows, and decision trees (Use when user describes "steps", "process", "flow")
- **Sequence Diagram**: For interactions between entities over time (Use when user describes "interactions", "messages between", "timeline")
- **Class Diagram**: For object-oriented structures and relationships
- **State Diagram**: For state machines and transitions
- **ER Diagram**: For database relationships
- **Gantt Chart**: For project schedules and timelines
- **Pie Chart**: For data distribution
- **Git Graph**: For version control branching

### FLOWCHART SYNTAX (flowchart TD)
Use this when the user describes a process or workflow.

\`\`\`mermaid
flowchart TD
    A["Start"] --> B{"Is it working?"}
    B -->|Yes| C["Great"]
    B -->|No| D["Debug"]
    D --> E["Test Again"]
    E --> B
    C --> F["End"]
\`\`\`

**Flowchart Rules**:
1. **EVERY NODE MUST HAVE A LABEL IN QUOTES**: \`id["Label Text"]\`
2. **Node Shapes**:
   - \`id["Label Text"]\` - Rectangle (processes)
   - \`id{"Label Text"}\` - Diamond (decisions)
   - \`id(["Label Text"])\` - Stadium (start/end)
3. **Node IDs**: Start with a letter (e.g., A, B, Start, Login), NOT a number.

### SEQUENCE DIAGRAM SYNTAX (sequenceDiagram)
Use this when the user describes interactions between actors, systems, or components over time.

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant D as Database
    
    U->>C: Enter Credentials
    C->>S: POST /login
    S->>D: Validate User
    D-->>S: User Found
    S-->>C: 200 OK (Token)
    C-->>U: Redirect to Dashboard
\`\`\`

**Sequence Diagram Rules**:
1. **Define Participants**: \`participant Name as Label\` (Optional but recommended for clearer names)
2. **Interaction Syntax**: \`Source->>Target: Message Text\`
   - \`->>\` : Solid line (Request)
   - \`-->>\`: Dotted line (Response)
3. **Message Text**: Write the text directly after the colon. **NO QUOTES NEEDED** for the message text unless it contains special characters.
   - ✅ \`A->>B: Hello World\`
   - ✅ \`A->>B: "Hello World"\` (Also fine)
   - ❌ \`A->>B\` (Missing message)

### OUTPUT FORMAT
Return a JSON object with:
\`\`\`json
{
  "mermaid": "flowchart TD\\n    A[\"Start\"] --> B[\"End\"]",
  "type": "flowchart"
}
\`\`\`
OR
\`\`\`json
{
  "mermaid": "sequenceDiagram\\n    participant A\\n    participant B\\n    A->>B: Hello",
  "type": "sequenceDiagram"
}
\`\`\`

### RESERVED KEYWORDS - DO NOT USE AS NODE IDs:
- ❌ \`end\` - Use \`finish\`, \`done\`, \`complete\`, \`final\` instead
- ❌ \`graph\`, \`subgraph\`, \`style\`, \`class\`, \`click\`
- ❌ \`direction\`, \`flowchart\`

**REMEMBER**:
1. Choose the right diagram type.
2. For Flowcharts: \`id["Label"]\`
3. For Sequence Diagrams: \`A->>B: Message\`
4. Keep it simple and compatible.
`;

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
    interface ApiParams {
      model: string;
      messages: Array<{ role: "user" | "system"; content: string }>;
      max_completion_tokens: number;
      response_format?: { type: "json_object" };
    }
    
    const apiParams: ApiParams = {
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
      // Try to clean up the response content first
      let cleanedContent = responseContent.trim();
      
      // Remove markdown code blocks if present
      cleanedContent = cleanedContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/g, '');
      
      // Try to parse as JSON
      let parsed: { mermaid?: string; type?: string } | null = null;
      try {
        parsed = JSON.parse(cleanedContent);
      } catch (jsonError) {
        // If JSON parsing fails, try to extract mermaid syntax directly using regex
        console.warn("JSON parse failed, attempting to extract mermaid syntax from response...");
        console.warn("JSON error:", jsonError instanceof Error ? jsonError.message : String(jsonError));
        console.warn("Response content (first 1000 chars):", cleanedContent.substring(0, 1000));
        
        // Strategy 1: Try to find mermaid syntax in the response with more flexible regex
        // Handle cases where the JSON string might be broken or unescaped
        const mermaidMatch = cleanedContent.match(/"mermaid"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        
        // Strategy 2: If that fails, try to find the mermaid field even if quotes are broken
        if (!mermaidMatch) {
          // Look for "mermaid": followed by content until we find a pattern that looks like mermaid syntax
          const mermaidFieldMatch = cleanedContent.match(/"mermaid"\s*:\s*"([^"]*)/);
          if (mermaidFieldMatch) {
            // Try to extract everything after the opening quote until we find a closing pattern
            const startIndex = cleanedContent.indexOf('"mermaid"');
            if (startIndex >= 0) {
              const afterMermaid = cleanedContent.substring(startIndex);
              // Look for flowchart/sequence/etc. patterns
              const syntaxMatch = afterMermaid.match(/(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)[\s\S]*?(?=\s*"|,|\n\s*"type"|$)/);
              if (syntaxMatch) {
                const extractedMermaid = syntaxMatch[0].replace(/^[^"]*"/, '').replace(/\\n/g, '\n').trim();
                const extractedType = syntaxMatch[1] || "flowchart";
                parsed = { mermaid: extractedMermaid, type: extractedType };
              }
            }
          }
        }
        
        // Strategy 3: If still no match, try to find flowchart/sequence/etc. directly in the content
        if (!parsed || !parsed.mermaid) {
          const diagramTypeMatch = cleanedContent.match(/(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)/i);
          if (diagramTypeMatch) {
            const type = diagramTypeMatch[1].toLowerCase();
            // Try to extract the full diagram syntax
            const diagramStart = cleanedContent.indexOf(diagramTypeMatch[0]);
            if (diagramStart >= 0) {
              const afterStart = cleanedContent.substring(diagramStart);
              // Extract until we hit certain boundaries (closing brace, end of string, etc.)
              const endMatch = afterStart.match(/(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)[\s\S]*?(?=\s*"|,|\n\s*"type"|$)/);
              if (endMatch) {
                const extractedMermaid = endMatch[0].replace(/^[^"]*"/, '').replace(/\\n/g, '\n').trim();
                parsed = { mermaid: extractedMermaid, type: type };
              }
            }
          }
        }
        
        // Strategy 4: Last resort - if we still have the original match, use it
        if (mermaidMatch && mermaidMatch[1] && (!parsed || !parsed.mermaid)) {
          const extractedMermaid = mermaidMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          const extractedType = cleanedContent.match(/"type"\s*:\s*"([^"]+)"/)?.[1] || "flowchart";
          parsed = { mermaid: extractedMermaid, type: extractedType };
        }
        
        // Strategy 5: Last resort - try to extract any mermaid-like syntax from the entire response
        if (!parsed || !parsed.mermaid) {
          // Look for any line that starts with flowchart, sequenceDiagram, etc.
          const allLines = cleanedContent.split('\n');
          for (const line of allLines) {
            const diagramMatch = line.match(/^\s*(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)\s+([A-Z]{2})/i);
            if (diagramMatch) {
              // Found a diagram start, try to extract the whole diagram
              const lineIndex = allLines.indexOf(line);
              const remainingLines = allLines.slice(lineIndex);
              // Try to find where the diagram ends (look for closing patterns or end of meaningful content)
              const diagramLines: string[] = [];
              for (let i = 0; i < remainingLines.length; i++) {
                const currentLine = remainingLines[i];
                diagramLines.push(currentLine);
                // Stop if we hit certain patterns that suggest end of diagram
                if (currentLine.match(/^\s*[}\]]\s*$/) || 
                    currentLine.match(/^\s*"type"/) ||
                    (i > 10 && currentLine.trim().length === 0)) {
                  break;
                }
              }
              const extractedMermaid = diagramLines.join('\n').trim();
              if (extractedMermaid.length > 20) { // Make sure we got something substantial
                parsed = { mermaid: extractedMermaid, type: diagramMatch[1].toLowerCase() };
                break;
              }
            }
          }
        }
        
        // If we still don't have a valid parsed object, throw error
        if (!parsed || !parsed.mermaid || typeof parsed.mermaid !== "string") {
          throw new Error(`Failed to parse JSON and could not extract mermaid syntax. JSON error: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}. Response preview: ${cleanedContent.substring(0, 500)}`);
        }
      }
      
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Response does not contain valid object");
      }

      if (!parsed.mermaid || typeof parsed.mermaid !== "string") {
        throw new Error("Response does not contain mermaid syntax");
      }

      mermaidSyntax = parsed.mermaid;
      diagramType = parsed.type || "flowchart";
      
      // Clean up mermaid syntax (remove extra whitespace, fix line breaks)
      mermaidSyntax = mermaidSyntax.replace(/\\n/g, '\n').trim();
      
      // Validate and clean Mermaid syntax to fix common issues
      mermaidSyntax = cleanAndValidateMermaidSyntax(mermaidSyntax);
      
      console.log("Mermaid syntax generated:", mermaidSyntax.substring(0, 200) + "...");
      
      // Validate Mermaid syntax has nodes with labels
      if (!mermaidSyntax || mermaidSyntax.trim().length === 0) {
        throw new Error("Mermaid syntax is empty");
      }
      
      // Check for node definitions with labels
      // Look for patterns like: id["label"], id{"label"}, id(["label"])
      const nodePattern = /(\w+)\s*(?:\[|\["|\(|\(\["|\{)([^\]\)\}]*?)(?:\]|"\]|\)|"\)\]|\})/g;
      const lines = mermaidSyntax.split('\n');
      const nodeDefinitions: Array<{ id: string; label: string }> = [];
      
      lines.forEach((line) => {
        const matches = Array.from(line.matchAll(nodePattern));
        matches.forEach((match) => {
          if (match[1] && match[2]) {
            const label = match[2].replace(/^"|"$/g, '').trim();
            if (label.length > 0) {
              nodeDefinitions.push({ id: match[1], label });
            }
          }
        });
      });
      
      // Validate that we found at least some nodes with labels
      if (nodeDefinitions.length === 0) {
        console.warn("No node definitions with labels found in Mermaid syntax");
        console.warn("Mermaid syntax:", mermaidSyntax);
        // Don't fail completely, but mark it as potentially problematic
      }
      
      // Check for empty labels (nodes without proper labels)
      const emptyLabelPattern = /(\w+)\s*(?:\[\s*\]|\{\s*\}|\(\s*\))/g;
      const emptyMatches = Array.from(mermaidSyntax.matchAll(emptyLabelPattern));
      if (emptyMatches.length > 0) {
        console.warn(`Found ${emptyMatches.length} nodes with empty labels`);
      }
      
    } catch (parseError) {
      console.error("Error parsing Mermaid response:", parseError);
      console.error("Response content (full):", responseContent);
      const errorMessage = parseError instanceof Error 
        ? parseError.message 
        : String(parseError);
      return NextResponse.json(
        { 
          error: "Invalid Mermaid response from AI", 
          details: errorMessage,
          message: "AI สร้างไดอะแกรมไม่สำเร็จ กรุณาลองอีกครั้งหรือปรับ prompt ให้ชัดเจนขึ้น",
          debug: {
            responseLength: responseContent.length,
            responsePreview: responseContent.substring(0, 500)
          }
        },
        { status: 500 }
      );
    }

    // Extract node labels for client-side fallback
    const nodePattern = /(\w+)\s*(?:\[|\["|\(|\(\["|\{)([^\]\)\}]*?)(?:\]|"\]|\)|"\)\]|\})/g;
    const lines = mermaidSyntax.split('\n');
    const nodeLabels: Record<string, string> = {};
    
    lines.forEach((line) => {
      const matches = Array.from(line.matchAll(nodePattern));
      matches.forEach((match) => {
        if (match[1] && match[2]) {
          const label = match[2].replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
          if (label.length > 0) {
            nodeLabels[match[1]] = label;
          }
        }
      });
    });
    
    const hasLabels = Object.keys(nodeLabels).length > 0;

    // If user requested Mermaid format, return it directly
    if (format === "mermaid") {
      return NextResponse.json({
        mermaid: mermaidSyntax,
        type: diagramType,
        format: "mermaid",
        hasLabels,
        nodeLabels,
        rawPrompt: sanitizedPrompt,
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
      hasLabels,
      nodeLabels, // Provide parsed labels for client-side fallback
      rawPrompt: sanitizedPrompt,
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

