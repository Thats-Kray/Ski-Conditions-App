import fetch from "node-fetch"

export async function moderateText(text) {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ input: text }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI Moderation API error: ${response.status}`)
  }

  const data = await response.json()
  const result = data.results?.[0]
  if (!result) throw new Error("OpenAI Moderation API returned no result")

  if (!result.flagged) {
    return { flagged: false, category: null, score: null }
  }

  const [topCategory] = Object.entries(result.category_scores)
    .sort(([, a], [, b]) => b - a)

  return { flagged: true, category: topCategory[0], score: topCategory[1] }
}
