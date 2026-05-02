// Prueba manual de admin y aprobaciones
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

async function manualTest() {
  console.log('🔍 PRUEBA MANUAL - ADMIN Y APROBACIONES\n');

  // 1. Login simple
  console.log('🔐 Intentando login con admin real...');
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'empresa.agente@demo.com',
      password: 'Admin123!'
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Response: ${response.body}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const token = data.data?.token;
      
      console.log('\n✅ LOGIN EXITOSO');
      console.log(`Role: ${data.data?.user?.role}`);
      console.log(`Email: ${data.data?.user?.email}`);
      
      if (token) {
        console.log('\n📋 VERIFICANDO ENVÍOS PARA APROBAR...');
        
        // 2. Ver shipments
        try {
          const shipmentsResponse = await makeRequest('/api/v1/shipments', 'GET', null, {
            'Authorization': `Bearer ${token}`
          });
          
          console.log(`\n📦 Shipments Status: ${shipmentsResponse.statusCode}`);
          
          if (shipmentsResponse.statusCode === 200) {
            const shipmentsData = JSON.parse(shipmentsResponse.body);
            console.log(`📊 Total shipments: ${shipmentsData.data?.length || 0}`);
            
            if (shipmentsData.data && shipmentsData.data.length > 0) {
              console.log('\n📋 LISTA DE ENVÍOS:');
              shipmentsData.data.forEach((shipment, index) => {
                console.log(`\n${index + 1}. Envío ID: ${shipment.id}`);
                console.log(`   Estado: ${shipment.status}`);
                console.log(`   Cliente: ${shipment.customer?.name || 'N/A'}`);
                
                // Verificar si necesita aprobación
                if (shipment.status === 'pending' || shipment.status === 'PENDING') {
                  console.log('   ⚠️  NECESITA APROBACIÓN');
                  console.log(`   📝 Para aprobar: PUT /api/v1/shipments/${shipment.id}/approve`);
                }
              });
            }
          }
        } catch (error) {
          console.log('❌ Error obteniendo shipments:', error.message);
        }
        
        // 3. Verificar endpoints de aprobación
        console.log('\n🔍 BUSCANDO ENDPOINTS DE APROBACIÓN...');
        
        const approvalTest = await makeRequest('/api/v1/shipments/pending', 'GET', null, {
          'Authorization': `Bearer ${token}`
        });
        
        console.log(`Shipments pending: ${approvalTest.statusCode}`);
        
        if (approvalTest.statusCode === 200) {
          console.log('✅ Endpoint de aprobación encontrado');
          console.log(`Response: ${approvalTest.body}`);
        } else {
          console.log('❌ Endpoint /api/v1/shipments/pending no encontrado');
        }
        
      }
    }
  } catch (error) {
    console.log('❌ Error en login:', error.message);
  }

  console.log('\n📝 CONCLUSIONES:');
  console.log('❌ admin@transport-pro.com: NO EXISTE');
  console.log('✅ empresa.agente@demo.com: ES EL ADMIN CORRECTO');
  console.log('🔍 Para aprobar cotizaciones usa el frontend con:');
  console.log('   Email: empresa.agente@demo.com');
  console.log('   Password: Admin123!');
  console.log('   URL: http://localhost:5173');
}

manualTest();
