// Script para crear usuario de prueba
const http = require('http');

function makeRequest(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
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

async function createTestUser() {
  console.log('👤 Creando usuario de prueba...\n');

  // Intentar registrar usuario con contraseña fuerte
  try {
    const response = await makeRequest('/api/v1/auth/register', 'POST', {
      name: 'Usuario Prueba',
      email: 'test@transport-pro.com',
      password: 'TestPassword2024!@#', // Contraseña fuerte
      taxId: '12345678-9',
      tenantSlug: 'demo' // Asumimos que existe tenant 'demo'
    });

    console.log(`Status: ${response.statusCode}`);
    console.log(`Body: ${response.body}`);

    if (response.statusCode === 201) {
      console.log('\n✅ Usuario creado exitosamente!');
      console.log('📧 Email: test@transport-pro.com');
      console.log('🔑 Password: TestPassword2024!@#');
    } else {
      console.log('\n❌ Error al crear usuario');
      console.log('🔍 Posibles causas:');
      console.log('   - El tenant "demo" no existe');
      console.log('   - El email ya está registrado');
      console.log('   - El RUT ya existe en el sistema');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n🔐 Para hacer login:');
  console.log('POST /api/v1/auth/login');
  console.log(JSON.stringify({
    email: 'test@transport-pro.com',
    password: 'TestPassword2024!@#'
  }, null, 2));
}

createTestUser();
