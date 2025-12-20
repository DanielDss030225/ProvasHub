const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Please set GEMINI_API_KEY environment variable.");
    process.exit(1);
}
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

async function run() {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.statusText + " " + res.status);
        const data = await res.json();
        console.log("Available models:");
        data.models.forEach(m => {
            if (m.name.includes("gemini")) {
                console.log(m.name);
                console.log(" - Supported methods: " + JSON.stringify(m.supportedGenerationMethods));
            }
        });
    } catch (e) {
        console.error(e);
    }
}

run();
