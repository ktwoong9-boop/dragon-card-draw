(() => {
  const KEYS = {
    ㄱ: "R", ㄲ: "R", ㄳ: "RT", ㄴ: "S", ㄵ: "SW", ㄶ: "SG", ㄷ: "E", ㄸ: "E", ㄹ: "F",
    ㄺ: "FR", ㄻ: "FA", ㄼ: "FQ", ㄽ: "FT", ㄾ: "FX", ㄿ: "FV", ㅀ: "FG", ㅁ: "A", ㅂ: "Q",
    ㅃ: "Q", ㅄ: "QT", ㅅ: "T", ㅆ: "T", ㅇ: "D", ㅈ: "W", ㅉ: "W", ㅊ: "C", ㅋ: "Z",
    ㅌ: "X", ㅍ: "V", ㅎ: "G",
    ㅏ: "K", ㅐ: "O", ㅑ: "I", ㅒ: "O", ㅓ: "J", ㅔ: "P", ㅕ: "U", ㅖ: "P", ㅗ: "H",
    ㅘ: "HK", ㅙ: "HO", ㅚ: "HL", ㅛ: "Y", ㅜ: "N", ㅝ: "NJ", ㅞ: "NP", ㅟ: "NL",
    ㅠ: "B", ㅡ: "M", ㅢ: "ML", ㅣ: "L",
  };
  const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const MEDIALS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const FINALS = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];

  function toLatin(text) {
    let out = "";
    for (const ch of String(text || "")) {
      const code = ch.charCodeAt(0) - 0xac00;
      if (code >= 0 && code < 11172) {
        out += KEYS[INITIALS[Math.floor(code / 588)]];
        out += KEYS[MEDIALS[Math.floor((code % 588) / 28)]];
        out += KEYS[FINALS[code % 28]] || "";
      } else {
        out += KEYS[ch] || ch;
      }
    }
    return out;
  }

  function normalizeCode(text) {
    return toLatin(text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  }

  function bindCodeInput(input) {
    let composing = false;
    const apply = () => {
      const next = normalizeCode(input.value);
      if (input.value !== next) input.value = next;
    };
    input.addEventListener("compositionstart", () => {
      composing = true;
    });
    input.addEventListener("compositionend", () => {
      composing = false;
      apply();
    });
    input.addEventListener("input", (event) => {
      if (composing || event.isComposing) return;
      apply();
    });
    input.addEventListener("blur", apply);
  }

  window.CodeInput = { normalizeCode, bindCodeInput };
})();
