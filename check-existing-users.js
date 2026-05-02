// Script para verificar usuarios existentes y crear accesos de prueba
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

async function checkAndCreateUsers() {
  console.log('🔍 Verificando accesos de prueba...\n');

  // Lista de posibles usuarios para probar
  const testUsers = [
    { email: 'admin@transport-pro.com', password: 'AdminPassword123!' },
    { email: 'user@transport-pro.com', password: 'UserPassword123!' },
    { email: 'test@transport-pro.com', password: 'TestPassword123!' },
    { email: 'demo@transport-pro.com', password: 'DemoPassword123!' },
    { email: 'owner@transport-pro.com', password: 'OwnerPassword123!' }
  ];

  let validUser = null;

  // Probar cada usuario
  for (const user of testUsers) {
    try {
      console.log(`🔐 Probando: ${user.email}`);
      const response = await makeRequest('/api/v1/auth/login', 'POST', user);
      
      if (response.statusCode === 200) {
        console.log(`✅ Usuario válido: ${user.email}`);
        validUser = user;
        break;
      } else {
        console.log(`❌ Inválido: ${user.email} (Status: ${response.statusCode})`);
      }
    } catch (error) {
      console.log(`❌ Error con ${user.email}: ${error.message}`);
    }
  }

  if (validUser) {
    console.log('\n🎉 ¡Acceso encontrado!');
    console.log('📧 Email:', validUser.email);
    console.log('🔑 Password:', validUser.password);
    console.log('\n🌐 Para acceder:');
    console.log('1. Frontend: http://localhost:5173');
    console.log('2. Usa estas credenciales para login');
  } else {
    console.log('\n❌ No se encontraron usuarios válidos');
    console.log('🔧 Necesitas crear usuarios primero con el seed de la base de datos');
    console.log('\n💡 Comandos para crear datos de prueba:');
    console.log('cd backend && npm run seed:test-agents');
    console.log('cd backend && npm run seed:demo-ui');
  }

  // Mostrar información del sistema
  console.log('\n📊 Información del Sistema:');
  console.log('🌐 Frontend: http://localhost:5173');
  console.log('🔧 Backend API: http://localhost:4000');
  console.log('💚 Health: http://localhost:4000/health');
  console.log('\n🔒 Headers de seguridad activos en todas las respuestas');

  // Mostrar ejemplo de uso de API
  console.log('\n📡 Ejemplos de uso de API:');
  console.log('GET  http://localhost:4000/health');
  console.log('POST http://localhost:4000/api/v1/auth/login');
  console.log('GET  http://localhost:4000/api/v1/me (requiere token)');
}

checkAndCreateUsers();
