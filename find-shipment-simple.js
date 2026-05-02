// Versión simple para buscar envío WDLXTI
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

async function findWDLXTI() {
  console.log('🔍 Buscando envío WDLXTI...\n');

  // Login admin
  let token = null;
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      token = data.data?.token;
      console.log('✅ Login exitoso');
    }
  } catch (error) {
    console.log('❌ Error login:', error.message);
    return;
  }

  // Buscar envíos
  try {
    const response = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log(`📊 Total envíos: ${data.data?.length || 0}`);
      
      let wdlxtiFound = false;
      
      data.data.forEach((shipment, index) => {
        const shipmentInfo = `
${index + 1}. ID: ${shipment.id}
   Number: ${shipment.number || 'N/A'}
   Estado: ${shipment.status}
   Cliente: ${shipment.customer?.name || 'N/A'}
   Origen: ${shipment.origin || 'N/A'}
   Destino: ${shipment.destination || 'N/A'}
   Conductor: ${shipment.driver?.name || 'No asignado'}
   Vehículo: ${shipment.vehicle?.plate || 'No asignado'}
   Monto: ${shipment.amount || 'No definido'}
        `;
        
        console.log(shipmentInfo);
        
        // Verificar si es WDLXTI
        if (shipment.id?.includes('WDLXTI') || shipment.number === 'WDLXTI' || 
            shipment.customer?.name?.includes('Cliente Agente 1')) {
          console.log('\n🎯 ¡ENVÍO WDLXTI ENCONTRADO!');
          console.log('   Este es el envío que necesitas aprobar');
          wdlxtiFound = true;
          
          // Mostrar problemas
          console.log('\n❌ PROBLEMAS IDENTIFICADOS:');
          if (!shipment.driverId) console.log('   - Sin conductor asignado');
          if (!shipment.vehicleId) console.log('   - Sin vehículo asignado');
          if (!shipment.amount) console.log('   - Sin monto definido');
        }
      });
      
      if (!wdlxtiFound) {
        console.log('\n❌ No se encontró envío WDLXTI');
        console.log('🔍 Puede que el ID sea diferente o el envío no exista');
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n📝 SOLUCIÓN:');
  console.log('1. El frontend muestra vista lateral en lugar de modal (issue de UX)');
  console.log('2. Los botones de asignación pueden estar ocultos o no funcionar');
  console.log('3. Necesitas asignar conductor, vehículo y monto manualmente');
  console.log('4. Considera usar la API directamente para asignar');
}

findWDLXTI();
