import adapter from "@sveltejs/adapter-node";

const config = {
    kit: {
        adapter: adapter(),
        csrf: {
            // WHY: MCP 与短链上传来自 curl 等非浏览器客户端，没有同源 Origin，鉴权由 Key/token 负责
            trustedOrigins: ["*"]
        }
    }
};

export default config;
