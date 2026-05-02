// Script de pruebas de seguridad para Transport Pro
const http = require('http');

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Security-Test-Script/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runSecurityTests() {
  console.log('🔒 Iniciando pruebas de seguridad para Transport Pro...\n');

  // Test 1: Health check
  console.log('✅ Test 1: Health Check');
  try {
    const response = await makeRequest('/health');
    console.log(`   Status: ${response.statusCode}`);
    console.log(`   Headers: CSP presente? ${!!response.headers['content-security-policy']}`);
    console.log(`   Headers: HSTS presente? ${!!response.headers['strict-transport-security']}`);
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  // Test 2: Login con credenciales inválidas
  console.log('🔐 Test 2: Login con credenciales inválidas');
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'test@example.com',
      password: 'wrongpassword'
    });
    console.log(`   Status: ${response.statusCode} (debería ser 401)`);
    console.log(`   Body: ${response.body.substring(0, 100)}...`);
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  // Test 3: Rate limiting
  console.log('🚦 Test 3: Rate limiting (múltiples requests)');
  try {
    for (let i = 0; i < 5; i++) {
      const response = await makeRequest('/api/v1/auth/login', 'POST', {
        email: 'test@example.com',
        password: 'wrongpassword'
      });
      console.log(`   Request ${i + 1}: Status ${response.statusCode}`);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  // Test 4: Headers de seguridad
  console.log('🛡️ Test 4: Headers de seguridad');
  try {
    const response = await makeRequest('/health');
    const securityHeaders = [
      'content-security-policy',
      'strict-transport-security',
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection'
    ];
    
    securityHeaders.forEach(header => {
      const present = !!response.headers[header];
      console.log(`   ${header}: ${present ? '✅' : '❌'}`);
    });
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  // Test 5: User-Agent sospechoso
  console.log('🤖 Test 5: User-Agent sospechoso (bot detection)');
  try {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/health',
      method: 'GET',
      headers: {
        'User-Agent': 'Bot-Scanner/1.0'
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      });
      req.on('error', reject);
      req.end();
    });

    console.log(`   Status: ${response.statusCode}`);
    console.log(`   Bot detectado en logs? (revisar consola del servidor)`);
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');

  console.log('🎉 Pruebas de seguridad completadas!');
  console.log('📋 Revisa los logs del servidor para ver los eventos de seguridad.');
}

// Ejecutar pruebas
runSecurityTests().catch(console.error);
