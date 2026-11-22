from playwright.sync_api import sync_playwright
import time


def inspect_speech_voices():
    with sync_playwright() as p:

        browser = p.chromium.launch(
            headless=False
        )

        page = browser.new_page()

        page.goto("https://example.com")

        # Give Chromium time to initialise speech synthesis.
        time.sleep(2)

        voices = page.evaluate("""
            () => {
                return new Promise((resolve) => {

                    function getVoices() {
                        const voices = window.speechSynthesis.getVoices();

                        return voices.map(v => ({
                            name: v.name,
                            lang: v.lang,
                            default: v.default,
                            voiceURI: v.voiceURI
                        }));
                    }

                    let voices = getVoices();

                    if (voices.length > 0) {
                        resolve(voices);
                        return;
                    }

                    let resolved = false;

                    const finish = () => {
                        if (resolved) return;
                        resolved = true;

                        resolve(getVoices());
                    };

                    window.speechSynthesis.addEventListener(
                        "voiceschanged",
                        finish,
                        { once: true }
                    );

                    // Fallback in case voiceschanged never fires.
                    setTimeout(finish, 5000);
                });
            }
        """)

        print(f"\nFound {len(voices)} available SpeechSynthesis voices:\n")

        print(
            f"{'Voice Name':<40} | "
            f"{'Language':<10} | "
            f"{'Default'}"
        )

        print("-" * 75)

        for voice in voices:
            print(
                f"{voice['name'][:39]:<40} | "
                f"{voice['lang']:<10} | "
                f"{voice['default']}"
            )

        browser.close()


if __name__ == "__main__":
    inspect_speech_voices()