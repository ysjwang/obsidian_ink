// AUTO-GENERATED from changelog.json by scripts/josiah-release.sh — do not edit by hand.
// Edit changelog.json (or pass --notes when releasing) instead.
const changelog: Record<string, string[]> = {
	"0.3.8": [
		"Added a second transcription option that interprets line breaks (keeps sentences together).",
		"The transcription progress notice now shows the selected provider and model."
	],
	"0.3.7": [
		"Added AI transcription: convert a handwriting embed to editable Markdown via Claude or Gemini."
	],
	"0.3.9": [
		"Update notices now show this fork's own release notes (was showing the original Ink v0.3.4 notes).",
		"The update notice title now reflects the installed version automatically."
	]
};

export default changelog;
