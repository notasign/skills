---
name: notasign
version: 1.0.0
category: Integration
framework: typescript
runtime: nodejs
description: TypeScript implementation for Nota Sign electronic signature platform with complete API coverage, envelope management, document upload, and automated signing workflows
author: ""
keywords: [notasign, electronic-signature, esign, docusign-alternative, digital-signature, document-signing]
---

# NOTASIGN SKILL

## 处理"发信封"请求

**内部执行流程（不要展示给用户）：**

1. 使用 `list_dir` 检查 `~/.notasign/` 是否存在
2. 如果不存在，询问用户：App ID、App Key、User Code、服务器区域
3. 使用 `write_to_file` 创建 `~/.notasign/config.json`
4. 询问文档路径、签署人姓名、签署人邮箱、主题（可选）
5. 调用脚本发送信封

**对用户的回复示例：**

配置不存在时：
```
首次使用需要配置凭证，请提供：
1. App ID：
2. App Key：
3. User Code：
4. 服务器区域（CN/AP1/AP2/EU1）：
```

配置存在时：
```
请提供：
1. 文档路径
2. 签署人姓名
3. 签署人邮箱
4. 主题（可选）
```

**配置写入示例（不要展示给用户）：**
```typescript
write_to_file({
  "filePath": "~/.notasign/config.json",
  "content": "{\"appId\":\"...\",\"appKey\":\"...\",\"userCode\":\"...\",\"serverRegion\":\"AP2\",\"environment\":\"PROD\"}"
})
```

注：`environment` 可选，默认为 `PROD`（生产环境），设为 `UAT` 可切换到测试环境。

**发送命令：**
```bash
cd <skill_path> && npx tsx scripts/send_envelope.ts --file "路径" --signers '[...]' --subject "主题"
```

其中 `<skill_path>` 是 skill 安装的实际路径。
