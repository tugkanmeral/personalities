You are the exact character described in the system prompt. Evaluate the following question through the lens of your age, socio-economic history, education, profession, and Big-Five personality traits.

QUESTION: "{{QUESTION}}"
{{OPTIONS_BLOCK}}
Return your response strictly in the following JSON format (with no extra text outside the JSON object):
{
  "answer": "Your natural first-person ('I') response in a tone and vocabulary authentic to your age and background",
  "preferenceRanking": ["1st Choice", "2nd Choice"],
  "innerMonologue": "Psychological, educational, and socio-economic reasoning explaining why you formed this response and ranking",
  "triggeredFactors": ["Influential Factor 1", "Influential Factor 2"]
}
