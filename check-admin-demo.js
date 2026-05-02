// Verificar admin@demo.com
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

async function checkAdminDemo() {
  console.log('🔍 Verificando admin@demo.com...\n');

  // Probar diferentes contraseñas comunes
  const passwordOptions = [
    'Admin123!',
    'admin123',
    'password',
    'demo123',
    'Demo123!',
    'admin',
    'Admin@123'
  ];

  for (const password of passwordOptions) {
    try {
      console.log(`🔐 Probando admin@demo.com con password: ${password}`);
      
      const response = await makeRequest('/api/v1/auth/login', 'POST', {
        email: 'admin@demo.com',
        password: password
      });
      
      console.log(`   Status: ${response.statusCode}`);
      
      if (response.statusCode === 200) {
        console.log('✅ ¡USUARIO ENCONTRADO!');
        const data = JSON.parse(response.body);
        console.log(`   Role: ${data.data?.user?.role}`);
        console.log(`   Tenant: ${data.data?.user?.tenantId}`);
        console.log(`   Token: ${data.data?.token?.substring(0, 50)}...`);
        
        // Probar acceso a rutas de aprobación
        await testApprovalAccess(data.data?.token);
        return;
      } else if (response.statusCode === 401) {
        console.log('   ❌ Contraseña incorrecta');
      } else {
        console.log(`   ❌ Error: ${response.body.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    // Pequeña pausa para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n❌ admin@demo.com no encontrado con ninguna contraseña común');
  console.log('\n🔍 Usuarios admin que SÍ existen:');
  console.log('✅ empresa.agente@demo.com / Admin123! (Admin real)');
  console.log('✅ Puedes crear admin@demo.com si lo necesitas');
}

async function testApprovalAccess(token) {
  if (!token) return;
  
  console.log('\n📋 Probando acceso a aprobaciones...');
  
  try {
    const response = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    console.log(`Shipments access: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const pendingCount = data.data?.filter(s => 
        s.status === 'pending' || s.status === 'PENDING'
      ).length || 0;
      
      console.log(`📊 Envíos totales: ${data.data?.length || 0}`);
      console.log(`⏳ Pendientes de aprobación: ${pendingCount}`);
      
      if (pendingCount > 0) {
        console.log('✅ Hay cotizaciones para aprobar');
      } else {
        console.log('ℹ️  No hay cotizaciones pendientes');
      }
    }
  } catch (error) {
    console.log('❌ Error verificando aprobaciones:', error.message);
  }
}

checkAdminDemo();
