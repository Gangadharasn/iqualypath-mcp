import app from "./app.js";
import { config } from "./config.js";

const port = config.chatPort();
const model = config.groqModel();

app.listen(port, () => {
  console.log(
    `qualypath-mcp chat server running on http://localhost:${port} | model: ${model.name} (${model.id})`
  );
  console.log(`Widget embed URL: http://localhost:${port}/widget/`);
});
