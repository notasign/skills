# Nota Sign 电子签名工具

基于 Nota Sign API 的命令行电子签名工具。

## 安装

确保已安装 Node.js 18+，然后解压 skill 包即可使用。

## 配置

首次使用需要配置 API 凭证：

```bash
npx tsx scripts/send_envelope.ts init
```

按提示输入：
- App ID
- App Key
- User Code
- 服务器区域（CN/AP1/AP2/EU1）

配置将保存到 `~/.notasign/config.json`。其中 `environment` 字段可选，默认为 `PROD`（生产环境），设为 `UAT` 可切换到测试环境。

## 发送信封

### 方式一：交互模式（推荐）

直接运行脚本，按提示输入信息：

```bash
npx tsx scripts/send_envelope.ts
```

### 方式二：命令行参数

```bash
npx tsx scripts/send_envelope.ts \
  --file /path/to/document.pdf \
  --signers '[{"userName":"张三","userEmail":"zhangsan@example.com"}]' \
  --subject "合同签署"
```

参数说明：
- `--file, -f`: 文档路径（必需）
- `--signers`: 签署人 JSON 数组（必需）
- `--subject, -s`: 主题（可选，默认使用文件名）

## 服务器区域

| 区域 | 说明 |
|------|------|
| CN | 中国区 |
| AP1 | 亚太1区（新加坡）|
| AP2 | 亚太2区（香港）|
| EU1 | 欧洲1区（法兰克福）|

## 获取凭证

1. 访问 [Nota Sign 控制台](https://account.notasign.com) 注册账号
2. 进入"集成 → 应用管理"创建应用
3. 获取 App ID 和 App Key
4. 获取 User Authorization Code

## 注意事项

- 配置文件建议设置权限：`chmod 600 ~/.notasign/config.json`
- 支持 PDF、DOC、DOCX 等格式
