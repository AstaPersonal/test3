import { NextResponse } from "next/server";

type ImportedWord = {
  fi: string;
  target: string;
};

function coerceWords(value: unknown): ImportedWord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const fi = "fi" in item && typeof item.fi === "string" ? item.fi.trim() : "";
      const target =
        "target" in item && typeof item.target === "string" ? item.target.trim() : "";

      if (!fi || !target) {
        return null;
      }

      return { fi, target };
    })
    .filter((item): item is ImportedWord => item !== null);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const targetLanguage =
      formData.get("targetLanguage") === "de" ? "de" : "en";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Kuva puuttuu pyynnöstä." },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          message:
            "OPENAI_API_KEY puuttuu. Lisää avain, jotta kuvasta tunnistus toimii.",
        },
        { status: 501 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageAsBase64 = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const instruction =
      targetLanguage === "en"
        ? "Poimi kuvasta suomi-englanti sanaparit."
        : "Poimi kuvasta suomi-saksa sanaparit.";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Palauta vain JSON muodossa { \"words\": [{\"fi\":\"...\",\"target\":\"...\"}] }. Jata pois kaikki epavarmat rivit.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${instruction} Jos rivi ei ole selkea sanapari, ohita se.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageAsBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return NextResponse.json(
        {
          message: "OCR/AI-pyynto epaonnistui.",
          detail: errorBody,
        },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = payload.choices?.[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { message: "OCR-vastaus oli tyhja." },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(raw) as { words?: unknown };
    const words = coerceWords(parsed.words).slice(0, 80);

    if (words.length === 0) {
      return NextResponse.json(
        { message: "Sanoja ei tunnistettu varmasti. Kokeile tarkempaa kuvaa." },
        { status: 422 },
      );
    }

    return NextResponse.json({ words });
  } catch {
    return NextResponse.json(
      { message: "Kuvatuonnissa tapahtui virhe." },
      { status: 500 },
    );
  }
}
