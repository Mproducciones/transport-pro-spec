// Script para verificar acceso de admin y problemas de aprobación
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

async function checkAdminAccess() {
  console.log('🔍 Verificando acceso de admin@transport-pro.com...\n');

  // 1. Probar login con admin@transport-pro.com
  try {
    console.log('🔐 Probando login con admin@transport-pro.com');
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@transport-pro.com',
      password: 'AdminPassword123!' // Intentar con contraseña común
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Body: ${response.body.substring(0, 200)}...`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log('✅ admin@transport-pro.com existe y es válido');
      console.log(`Token: ${data.data?.token?.substring(0, 50)}...`);
      console.log(`Role: ${data.data?.user?.role}`);
      console.log(`Tenant: ${data.data?.user?.tenantId}`);
      
      // Probar acceso a rutas admin
      await testAdminRoutes(data.data?.token);
    } else {
      console.log('❌ admin@transport-pro.com no existe o contraseña incorrecta');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n🔍 Verificando usuario empresa.agente@demo.com (admin real)...\n');
  
  // 2. Probar login con el admin real del seed
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'empresa.agente@demo.com',
      password: 'Admin123!'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log('✅ empresa.agente@demo.com (admin real)');
      console.log(`Role: ${data.data?.user?.role}`);
      console.log(`Tenant: ${data.data?.user?.tenantId}`);
      
      // Probar acceso a rutas de aprobación
      await testApprovalRoutes(data.data?.token);
    }
  } catch (error) {
    console.log('❌ Error con admin real:', error.message);
  }
}

async function testAdminRoutes(token) {
  if (!token) {
    console.log('❌ No hay token para probar rutas admin');
    return;
  }

  console.log('\n🛡️ Probando rutas de administrador...');
  
  const adminRoutes = [
    '/api/v1/users',
    '/api/v1/companies',
    '/api/v1/shipments',
    '/api/v1/invoices',
    '/api/v1/owner'
  ];

  for (const route of adminRoutes) {
    try {
      const response = await makeRequest(route, 'GET', null, {
        'Authorization': `Bearer ${token}`
      });
      
      console.log(`${route}: Status ${response.statusCode}`);
    } catch (error) {
      console.log(`${route}: Error - ${error.message}`);
    }
  }
}

async function testApprovalRoutes(token) {
  if (!token) {
    console.log('❌ No hay token para probar rutas de aprobación');
    return;
  }

  console.log('\n📋 Probando rutas de aprobación de cotizaciones...');
  
  const approvalRoutes = [
    '/api/v1/shipments',
    '/api/v1/invoices',
    '/api/v1/payments',
    '/api/v1/tariffs'
  ];

  for (const route of approvalRoutes) {
    try {
      const response = await makeRequest(route, 'GET', null, {
        'Authorization': `Bearer ${token}`
      });
      
      console.log(`${route}: Status ${response.statusCode}`);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        if (data.data && Array.isArray(data.data)) {
          console.log(`  📊 Encontrados ${data.data.length} registros`);
          
          // Buscar elementos que necesiten aprobación
          const pendingItems = data.data.filter(item => 
            item.status === 'pending' || 
            item.status === 'PENDING' ||
            item.needsApproval === true
          );
          
          if (pendingItems.length > 0) {
            console.log(`  ⏳ ${pendingItems.length} elementos pendientes de aprobación`);
            pendingItems.forEach((item, index) => {
              console.log(`    ${index + 1}. ID: ${item.id || item.id}, Status: ${item.status}`);
            });
          } else {
            console.log(`  ✅ No hay elementos pendientes de aprobación`);
          }
        }
      }
    } catch (error) {
      console.log(`${route}: Error - ${error.message}`);
    }
  }

  // Probar endpoint específico de aprobación si existe
  try {
    console.log('\n🔍 Buscando endpoints de aprobación específicos...');
    
    const approvalEndpoints = [
      '/api/v1/shipments/pending',
      '/api/v1/invoices/pending',
      '/api/v1/quotes/approve',
      '/api/v1/shipments/approve'
    ];

    for (const endpoint of approvalEndpoints) {
      const response = await makeRequest(endpoint, 'GET', null, {
        'Authorization': `Bearer ${token}`
      });
      
      console.log(`${endpoint}: Status ${response.statusCode}`);
      
      if (response.statusCode === 200) {
        console.log(`  ✅ Endpoint de aprobación encontrado`);
      }
    }
  } catch (error) {
    console.log('🔍 No se encontraron endpoints específicos de aprobación');
  }
}

checkAdminAccess();
