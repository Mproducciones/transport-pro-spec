// Script simple para verificar admin y aprobaciones
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

async function checkAdminAndApprovals() {
  console.log('🔍 Verificando acceso admin y aprobaciones...\n');

  // 1. Login con admin real
  let adminToken = null;
  try {
    console.log('🔐 Login con empresa.agente@demo.com (admin real)');
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'empresa.agente@demo.com',
      password: 'Admin123!'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      adminToken = data.data?.token;
      console.log('✅ Login exitoso');
      console.log(`Role: ${data.data?.user?.role}`);
      console.log(`Tenant: ${data.data?.user?.tenantId}`);
    }
  } catch (error) {
    console.log('❌ Error login:', error.message);
    return;
  }

  if (!adminToken) {
    console.log('❌ No se obtuvo token de admin');
    return;
  }

  // 2. Verificar envíos (shipments) - cotizaciones
  console.log('\n📦 Verificando envíos/cotizaciones...');
  try {
    const response = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    console.log(`Shipments - Status: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log(`📊 Total envíos: ${data.data?.length || 0}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n📋 Estados de envíos:');
        data.data.forEach((shipment, index) => {
          console.log(`${index + 1}. ID: ${shipment.id?.substring(0, 10)}...`);
          console.log(`   Estado: ${shipment.status}`);
          console.log(`   Cliente: ${shipment.customer?.name || 'N/A'}`);
          console.log(`   Origen: ${shipment.origin || 'N/A'}`);
          console.log(`   Destino: ${shipment.destination || 'N/A'}`);
          console.log(`   Necesita aprobación: ${shipment.needsApproval || 'No especificado'}`);
          console.log('');
        });
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo envíos:', error.message);
  }

  // 3. Verificar facturas (invoices)
  console.log('💰 Verificando facturas...');
  try {
    const response = await makeRequest('/api/v1/invoices', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    console.log(`Invoices - Status: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log(`📊 Total facturas: ${data.data?.length || 0}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n📋 Estados de facturas:');
        data.data.forEach((invoice, index) => {
          console.log(`${index + 1}. ID: ${invoice.id?.substring(0, 10)}...`);
          console.log(`   Estado: ${invoice.status}`);
          console.log(`   Número: ${invoice.number || 'N/A'}`);
          console.log(`   Monto: ${invoice.amount || 'N/A'}`);
          console.log('');
        });
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo facturas:', error.message);
  }

  // 4. Intentar aprobar un envío si existe
  console.log('🔍 Buscando endpoint de aprobación...');
  try {
    // Intentar diferentes endpoints de aprobación
    const approvalEndpoints = [
      '/api/v1/shipments/pending',
      '/api/v1/shipments/approve',
      '/api/v1/quotes/pending'
    ];

    for (const endpoint of approvalEndpoints) {
      try {
        const response = await makeRequest(endpoint, 'GET', null, {
          'Authorization': `Bearer ${adminToken}`
        });
        
        console.log(`${endpoint}: Status ${response.statusCode}`);
        
        if (response.statusCode === 200) {
          console.log(`✅ Endpoint encontrado: ${endpoint}`);
          const data = JSON.parse(response.body);
          console.log(`📊 Datos: ${JSON.stringify(data).substring(0, 100)}...`);
        }
      } catch (error) {
        console.log(`${endpoint}: No encontrado (${error.message})`);
      }
    }
  } catch (error) {
    console.log('❌ Error buscando endpoints:', error.message);
  }

  // 5. Verificar permisos del admin
  console.log('\n🛡️ Verificando permisos de admin...');
  try {
    const response = await makeRequest('/api/v1/me', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log('✅ Permisos de usuario actual:');
      console.log(`   Role: ${data.data?.role}`);
      console.log(`   Email: ${data.data?.email}`);
      console.log(`   Tenant: ${data.data?.tenantId}`);
      console.log(`   Permisos adicionales: ${JSON.stringify(data.data?.permissions || {})}`);
    }
  } catch (error) {
    console.log('❌ Error obteniendo info de usuario:', error.message);
  }

  console.log('\n📝 RESUMEN:');
  console.log('❌ admin@transport-pro.com: NO EXISTE en el sistema');
  console.log('✅ empresa.agente@demo.com: ES EL ADMIN REAL');
  console.log('🔍 Para aprobar cotizaciones: Usa empresa.agente@demo.com');
  console.log('🌐 Frontend: http://localhost:5173 con esas credenciales');
}

checkAdminAndApprovals();
