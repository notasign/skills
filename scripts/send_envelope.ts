/**
 * Nota Sign Send Envelope Script
 * @version 1.0.0
 */
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

type ServerRegion = 'CN' | 'AP1' | 'AP2' | 'EU1';
type Environment = 'PROD' | 'UAT';

const REGION_URLS: Record<Environment, Record<ServerRegion, string>> = {
  PROD: {
    CN: 'https://openapi-cn.notasign.cn',
    AP1: 'https://openapi-ap1.notasign.com',
    AP2: 'https://openapi-ap2.notasign.com',
    EU1: 'https://openapi-eu1.notasign.com'
  },
  UAT: {
    CN: 'https://openapi-cn.uat.notasign.cn',
    AP1: 'https://openapi-ap1.uat.notasign.com',
    AP2: 'https://openapi-ap2.uat.notasign.com',
    EU1: 'https://openapi-eu1.uat.notasign.com'
  }
};

interface NotaSignConfig {
  appId: string;
  appKey: string;
  serverRegion: ServerRegion;
  userCode: string;
  environment?: Environment;
}

interface ApiResponse {
  success: boolean;
  code?: string;
  message?: string;
  data?: any;
}

interface Signer {
  userName: string;
  userEmail: string;
}

// Crypto Utilities
function sortParameters(params: Record<string, any>): string {
  if (!params || Object.keys(params).length === 0) return '';
  const filteredParams: Record<string, string> = {};
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value !== null && value !== undefined && value !== '') filteredParams[key] = String(value);
  }
  return Object.keys(filteredParams).sort().map(key => `${key}=${filteredParams[key]}`).join('&');
}

function sign(data: string, appKeyStr: string): string {
  try {
    const keyBuffer = Buffer.from(appKeyStr.trim(), 'base64');
    const privateKey = crypto.createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
    const signObj = crypto.createSign('RSA-SHA256');
    signObj.update(data).end();
    return signObj.sign(privateKey).toString('base64');
  } catch (error) {
    throw new Error(`Failed to generate signature: ${error}`);
  }
}

const generateNonce = () => crypto.randomBytes(16).toString('hex');
const getTimestamp = () => String(Date.now());

function generateRS256JWT(payload: any, appKey: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const base64UrlEncode = (str: string) => Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const keyBuffer = Buffer.from(appKey.trim(), 'base64');
  const privateKeyObj = crypto.createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
  const signObj = crypto.createSign('RSA-SHA256');
  signObj.update(dataToSign).end();
  const encodedSignature = signObj.sign(privateKeyObj).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${dataToSign}.${encodedSignature}`;
}

// HTTP Utilities
interface HttpConfig { appId: string; appKey: string; serverUrl: string; }

let httpConfig: HttpConfig | null = null;

function initializeHttp(config: NotaSignConfig): void {
  const env: Environment = config.environment || 'PROD';
  httpConfig = {
    appId: config.appId,
    appKey: config.appKey,
    serverUrl: REGION_URLS[env][config.serverRegion]
  };
}

function buildHeaders(accessToken: string | null, requestPath: string): Record<string, string> {
  if (!httpConfig) throw new Error('HTTP config not initialized');
  const headers: Record<string, string> = {
    'X-GLOBAL-App-Id': httpConfig.appId,
    'X-GLOBAL-Api-SubVersion': '1.0',
    'X-GLOBAL-Sign-Type': 'RSA-SHA256',
    'X-GLOBAL-Timestamp': getTimestamp(),
    'X-GLOBAL-Nonce': generateNonce(),
    'X-GLOBAL-Request-Url': requestPath.split('?')[0]
  };
  if (accessToken) headers['Authorization'] = accessToken;
  return headers;
}

function addSignature(headers: Record<string, string>, body: any, method: string, queryParams?: Record<string, string>): void {
  if (!httpConfig) throw new Error('HTTP config not initialized');
  const signMap: Record<string, string> = { ...headers };
  if ((method === 'POST' || method === 'PUT') && body) {
    signMap['bizContent'] = JSON.stringify(body);
  } else if (method === 'GET' && queryParams) {
    signMap['bizContent'] = sortParameters(queryParams);
  }
  headers['X-GLOBAL-Sign'] = sign(sortParameters(signMap), httpConfig.appKey);
}

async function httpRequest(method: string, requestPath: string, data: any, headers: Record<string, string>): Promise<ApiResponse> {
  if (!httpConfig) throw new Error('HTTP config not initialized');
  const url = new URL(httpConfig.serverUrl + requestPath);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url.toString(), {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const body = await response.text();
    const jsonData = JSON.parse(body);
    return { success: jsonData.success !== false, data: jsonData.data, message: jsonData.message, code: jsonData.code };
  } catch (error) {
    if ((error as any).name === 'AbortError') throw new Error('Request timeout');
    if (error instanceof SyntaxError) throw new Error(`Failed to parse response: ${error}`);
    throw error;
  }
}

async function httpPost(requestPath: string, data: any, accessToken: string): Promise<ApiResponse> {
  const headers = buildHeaders(accessToken, requestPath);
  addSignature(headers, data, 'POST');
  return httpRequest('POST', requestPath, data, headers);
}

async function httpGet(requestPath: string, params: Record<string, string>, accessToken: string): Promise<ApiResponse> {
  const queryString = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
  const fullPath = `${requestPath}?${queryString}`;
  const headers = buildHeaders(accessToken, fullPath);
  addSignature(headers, null, 'GET', params);
  return httpRequest('GET', fullPath, null, headers);
}

async function uploadFileToUrl(uploadUrl: string, filePath: string): Promise<void> {
  const fileBuffer = await fs.readFile(filePath);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(uploadUrl, { method: 'PUT', body: fileBuffer, signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.status !== 200 && response.status !== 201) throw new Error(`Upload failed: ${response.status}`);
  } catch (error) {
    if ((error as any).name === 'AbortError') throw new Error('Upload timeout');
    throw error;
  }
}

// Nota Sign Client
let cachedAccessToken: string | null = null;
let tokenExpireTime: number | null = null;
let clientConfig: NotaSignConfig | null = null;

function createClient(config: NotaSignConfig): void {
  clientConfig = config;
  initializeHttp(config);
}

async function getAccessToken(): Promise<string> {
  if (!clientConfig) throw new Error('Client not initialized');
  const now = Date.now();
  if (cachedAccessToken && tokenExpireTime && now < tokenExpireTime - 300000) return cachedAccessToken;
  const nowSeconds = Math.floor(now / 1000);
  const jwtPayload = { iss: clientConfig.appId, sub: clientConfig.userCode, aud: 'band.Nota.com', exp: nowSeconds + 3600, iat: nowSeconds };
  const jwtToken = generateRS256JWT(jwtPayload, clientConfig.appKey);
  const response = await httpPost('/api/oauth/token', { grantType: 'jwt-bearer', assertion: jwtToken }, '');
  if (!response.success || !response.data) throw new Error('Failed to get access token: ' + (response.message || response.code));
  cachedAccessToken = response.data.accessToken;
  tokenExpireTime = now + (response.data.expiresIn || 7200) * 1000;
  return cachedAccessToken!;
}

async function getUploadUrl(fileType: string): Promise<{ fileUploadUrl: string; fileUrl: string }> {
  const token = await getAccessToken();
  const response = await httpGet('/api/file/upload-url', { fileType }, token);
  if (!response.success || !response.data) throw new Error('Failed to get upload URL: ' + (response.message || response.code));
  return response.data;
}

async function convertFileWithUrl(fileUrl: string, fileName: string): Promise<string> {
  const token = await getAccessToken();
  const response = await httpPost('/api/file/process', { fileUrls: [{ fileUrl, fileName, fileType: 'document' }] }, token);
  if (!response.success || !response.data) throw new Error('Failed to convert file: ' + (response.message || response.code));
  if (response.data.files?.[0]) return response.data.files[0].fileId;
  if (response.data.fileId) return response.data.fileId;
  throw new Error('API returned success but no file ID found');
}

async function uploadDocument(filePath: string): Promise<string> {
  const fileName = path.basename(filePath);
  const fileType = path.extname(fileName).toLowerCase() === '.xml' ? 'xml' : 'document';
  const uploadInfo = await getUploadUrl(fileType);
  await uploadFileToUrl(uploadInfo.fileUploadUrl, filePath);
  return convertFileWithUrl(uploadInfo.fileUrl, fileName);
}

async function createEnvelope(request: any): Promise<string> {
  const token = await getAccessToken();
  const response = await httpPost('/api/envelope/create', request, token);
  if (!response.success || !response.data) throw new Error('Failed to create envelope: ' + response.message);
  return response.data.envelopeId;
}

async function sendDocumentForSigning(filePath: string, signers: Signer[], subject?: string): Promise<string> {
  const isUrl = filePath.startsWith('http://') || filePath.startsWith('https://');
  const fileId = isUrl ? await convertFileWithUrl(filePath, path.basename(new URL(filePath).pathname)) : await uploadDocument(filePath);
  const fileName = isUrl ? path.basename(new URL(filePath).pathname, path.extname(filePath)) : path.basename(filePath, path.extname(filePath));
  const envelopeRequest = {
    subject: subject || fileName,
    signatureLevel: 'ES' as const,
    autoSend: true,
    documents: [{ documentId: 'doc_001', documentName: path.basename(filePath), documentFileId: fileId }],
    participants: signers.map((s, i) => ({ participantId: `participant_00${i + 1}`, participantName: s.userName, email: s.userEmail }))
  };
  return createEnvelope(envelopeRequest);
}

// CLI Interface
function parseArgs(args: string[]): { filePath: string; signers: Signer[]; subject: string } | null {
  if (args.length === 0) return null;
  let filePath: string | undefined, subject: string | undefined, customSigners: Signer[] | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') filePath = args[++i];
    else if (arg === '--subject' || arg === '-s') subject = args[++i];
    else if (arg === '--signers') { try { customSigners = JSON.parse(args[++i]); } catch { return null; } }
    else if (arg.startsWith('--')) return null;
  }
  if (!filePath || !customSigners?.length) return null;
  return { filePath, signers: customSigners, subject: subject || path.basename(filePath, path.extname(filePath)) };
}

const prompt = (question: string): Promise<string> => new Promise(resolve => {
  process.stdout.write(question);
  process.stdin.once('data', data => resolve(data.toString().trim()));
});

async function initConfig(): Promise<{ success: boolean; message: string; configPath?: string }> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const homeConfigPath = path.join(homeDir, '.notasign', 'config.json');
  const localConfigPath = path.join(process.cwd(), 'notasign-config.json');
  console.log('\n=== Nota Sign Configuration Setup ===\nWhere do you want to save the configuration?\n  1. Global: ' + homeConfigPath + '\n  2. Local: ' + localConfigPath);
  const choice = await prompt('Enter choice (1 or 2, default: 1): ');
  const configPath = choice === '2' ? localConfigPath : homeConfigPath;
  console.log('\nPlease enter your Nota Sign credentials:\n');
  const appId = await prompt('App ID: ');
  if (!appId) return { success: false, message: 'App ID is required' };
  console.log('App Key (Base64 encoded PKCS#8 private key):');
  const appKey = await prompt('> ');
  if (!appKey) return { success: false, message: 'App Key is required' };
  const userCode = await prompt('User Code: ');
  if (!userCode) return { success: false, message: 'User Code is required' };
  console.log('\nServer Region:\n  - CN: China\n  - AP1: Asia Pacific 1 (Singapore)\n  - AP2: Asia Pacific 2 (Hong Kong)\n  - EU1: Europe 1 (Frankfurt)');
  const serverRegion = (await prompt('Enter region (CN/AP1/AP2/EU1, default: AP2): ') || 'AP2') as ServerRegion;
  if (!['CN', 'AP1', 'AP2', 'EU1'].includes(serverRegion)) return { success: false, message: `Invalid region: ${serverRegion}` };
  console.log('\nEnvironment:\n  - PROD: Production (default)\n  - UAT: User Acceptance Testing');
  const environment = (await prompt('Enter environment (PROD/UAT, default: PROD): ') || 'PROD') as Environment;
  if (!['PROD', 'UAT'].includes(environment)) return { success: false, message: `Invalid environment: ${environment}` };
  const config: NotaSignConfig = { appId, appKey, userCode, serverRegion, environment };
  if (configPath === homeConfigPath) {
    try { await fs.mkdir(path.dirname(homeConfigPath), { recursive: true }); } catch (error) {
      return { success: false, message: `Failed to create config directory: ${error}` };
    }
  }
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true, message: 'Configuration saved successfully', configPath };
  } catch (error) {
    return { success: false, message: `Failed to write config file: ${error}` };
  }
}

async function loadConfig(): Promise<NotaSignConfig> {
  const homeConfigPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.notasign', 'config.json');
  const localConfigPath = path.join(process.cwd(), 'notasign-config.json');
  let configPath: string | null = null;
  try { await fs.access(localConfigPath); configPath = localConfigPath; } catch {
    try { await fs.access(homeConfigPath); configPath = homeConfigPath; } catch {}
  }
  if (!configPath) {
    throw new Error('Configuration file not found. Please run "init" command first:\n  npx tsx scripts/send_envelope.ts init\n\nOr create config at:\n  ' + homeConfigPath);
  }
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as NotaSignConfig;
    if (!config.appId || !config.appKey || !config.userCode || !config.serverRegion) {
      throw new Error('Missing required fields in config');
    }
    if (!['CN', 'AP1', 'AP2', 'EU1'].includes(config.serverRegion)) {
      throw new Error(`Invalid server region: ${config.serverRegion}`);
    }
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in config file: ${configPath}`);
    throw error;
  }
}

async function checkConfigExists(): Promise<{ exists: boolean; configPath?: string }> {
  const homeConfigPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.notasign', 'config.json');
  const localConfigPath = path.join(process.cwd(), 'notasign-config.json');
  try { await fs.access(localConfigPath); return { exists: true, configPath: localConfigPath }; } catch {
    try { await fs.access(homeConfigPath); return { exists: true, configPath: homeConfigPath }; } catch { return { exists: false }; }
  }
}

async function main(): Promise<{ success: boolean; step: string; message: string; data?: any; error?: string }> {
  try {
    const rawArgs = process.argv.slice(2);
    if (rawArgs[0] === 'init') {
      const result = await initConfig();
      if (result.success) console.log(`\n✓ ${result.message}\n  Config saved to: ${result.configPath}`);
      return { success: result.success, step: 'init', message: result.message, data: result.configPath ? { configPath: result.configPath } : undefined };
    }
    const configCheck = await checkConfigExists();
    const args = parseArgs(rawArgs);
    if (!configCheck.exists || !args) {
      console.log('\n=== Nota Sign 交互模式 ===\n');
      let config: NotaSignConfig;
      if (!configCheck.exists) {
        console.log('首次使用，需要配置凭证：\n');
        const initResult = await initConfig();
        if (!initResult.success) return { success: false, step: 'init', message: initResult.message };
        console.log(`\n✓ 配置已保存到: ${initResult.configPath}\n`);
        config = await loadConfig();
      } else {
        config = await loadConfig();
      }
      let filePath = args?.filePath || await prompt('文档路径: ');
      if (!filePath) return { success: false, step: 'input', message: '文档路径不能为空' };
      const isUrl = filePath.startsWith('http://') || filePath.startsWith('https://');
      if (!isUrl) {
        try { await fs.access(filePath); } catch { return { success: false, step: 'validate', message: '文件不存在', error: filePath }; }
      }
      let signers: Signer[];
      if (args?.signers?.length) {
        signers = args.signers;
      } else {
        const signersInput = await prompt('签署人信息 (格式: 姓名1,邮箱1;姓名2,邮箱2): ');
        if (!signersInput) return { success: false, step: 'input', message: '签署人信息不能为空' };
        signers = signersInput.split(';').map(s => { const [name, email] = s.trim().split(','); return { userName: name?.trim(), userEmail: email?.trim() }; }).filter(s => s.userName && s.userEmail);
        if (!signers.length) return { success: false, step: 'parse', message: '无法解析签署人信息' };
      }
      const subject = args?.subject || await prompt('主题 (可选，直接回车使用文件名): ') || path.basename(filePath, path.extname(filePath));
      createClient(config);
      console.log('\n正在发送信封...\n');
      const envelopeId = await sendDocumentForSigning(filePath, signers, subject);
      return { success: true, step: 'send', message: '信封发送成功', data: { filePath, envelopeId, signers, subject } };
    }
    const config = await loadConfig();
    const isUrl = args.filePath.startsWith('http://') || args.filePath.startsWith('https://');
    if (!isUrl) {
      try { await fs.access(args.filePath); } catch { return { success: false, step: 'validate', message: 'File not found', error: args.filePath }; }
    }
    createClient(config);
    const envelopeId = await sendDocumentForSigning(args.filePath, args.signers, args.subject);
    return { success: true, step: 'send', message: 'Envelope initiated successfully', data: { filePath: args.filePath, envelopeId, signers: args.signers, subject: args.subject } };
  } catch (error) {
    return { success: false, step: 'error', message: 'Failed to execute envelope flow', error: error instanceof Error ? error.message : String(error) };
  }
}

main().then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(result.success ? 0 : 1); }).catch(() => process.exit(1));
