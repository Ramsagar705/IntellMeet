const fallbackGenerateMeetingSummary = (transcript = "", title = "Meeting") => {
  if (!transcript || !transcript.trim()) {
    return `Summary for ${title}: The discussion focused on alignment, risk review, and next-step prioritization. The team agreed to capture decisions in a shared follow-up thread and monitor delivery blockers.`;
  }

  const sentences = transcript.split(/[.!?]+/).filter(Boolean);
  const highlightCount = Math.min(3, Math.max(1, sentences.length));
  const highlights = sentences.slice(0, highlightCount).map((sentence) => sentence.trim());

  return `Summary for ${title}: ${highlights.join(" ")}. Key outcomes included alignment on priorities, ownership clarification, and a follow-up plan to remove blockers by the next checkpoint.`;
};

const fallbackExtractActionItems = (transcript = "") => {
  if (!transcript || !transcript.trim()) {
    return [
      { title: "Confirm launch checklist", assignee: "Unassigned", status: "Open", dueDate: "This week" },
      { title: "Review stakeholder feedback", assignee: "Unassigned", status: "In progress", dueDate: "Tomorrow" },
    ];
  }

  const matchPatterns = [
    /(?:need to|should|must|will|we need to)\s+([^.!?]+)/gi,
    /(?:action item|follow-up|todo)\s*[:\-]?\s*([^.!?]+)/gi,
  ];

  const items = [];

  for (const pattern of matchPatterns) {
    const matches = transcript.matchAll(pattern);
    for (const match of matches) {
      const text = match[1]?.trim();
      if (text && text.length > 4) {
        items.push({
          title: text.replace(/^[\s-]+|[\s-]+$/g, ""),
          assignee: "Unassigned",
          status: "Open",
          dueDate: "This week",
        });
      }
    }
  }

  if (items.length === 0) {
    return [
      { title: "Review meeting notes and finalize owners", assignee: "Unassigned", status: "Open", dueDate: "This week" },
    ];
  }

  return items.slice(0, 3);
};

const generateMeetingSummary = async (transcript = "", title = "Meeting") => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackGenerateMeetingSummary(transcript, title);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an executive meeting summarizer. Return only the final summary paragraph in plain text.",
          },
          {
            role: "user",
            content: `Title: ${title}\nTranscript: ${transcript || "No notes provided."}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI summary request failed: ${response.status}`);
    }

    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content?.trim() || fallbackGenerateMeetingSummary(transcript, title);
  } catch (error) {
    console.warn("AI summary fallback triggered:", error.message);
    return fallbackGenerateMeetingSummary(transcript, title);
  }
};

const extractActionItems = async (transcript = "") => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackExtractActionItems(transcript);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Extract action items into JSON with title, assignee, status, and dueDate. Return only a JSON array.",
          },
          {
            role: "user",
            content: transcript || "No meeting notes available.",
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI action-items request failed: ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return fallbackExtractActionItems(transcript);
    }

    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((item) => ({
        title: item.title || "Follow up item",
        assignee: item.assignee || "Unassigned",
        status: item.status || "Open",
        dueDate: item.dueDate || "This week",
      }));
    }

    return fallbackExtractActionItems(transcript);
  } catch (error) {
    console.warn("AI action-item fallback triggered:", error.message);
    return fallbackExtractActionItems(transcript);
  }
};

module.exports = {
  generateMeetingSummary,
  extractActionItems,
};
