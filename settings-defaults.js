const COMMENT_SETTINGS_DEFAULTS = {
  commentModeEnabled: true,
  commentLang: "auto",
  commentMinLen: 50,
  commentMaxLen: 280,
  commentStyle: "sharp",
  commentEmoji: "light",
  commentAnalyzeVideo: true,
  commentAnalyzeImages: true,
  commentEndWithQuestion: false,
  commentCustomInstructions: "",
};

if (typeof globalThis !== "undefined") {
  globalThis.COMMENT_SETTINGS_DEFAULTS = COMMENT_SETTINGS_DEFAULTS;
}
