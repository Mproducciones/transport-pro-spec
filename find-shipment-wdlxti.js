// Buscar específicamente el envío WDLXTI y verificar sus detalles
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

async function findShipmentWDLXTI() {
  console.log('🔍 Buscando envío WDLXTI...\n');

  // Login como admin
  let adminToken = null;
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      adminToken = data.data?.token;
      console.log('✅ Login admin exitoso');
    }
  } catch (error) {
    console.log('❌ Error login admin:', error.message);
    return;
  }

  if (!adminToken) {
    console.log('❌ No se obtuvo token admin');
    return;
  }

  // Buscar todos los envíos con detalle
  console.log('\n📦 Buscando todos los envíos...');
  try {
    const response = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log(`📊 Total envíos: ${data.data?.length || 0}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n📋 Lista completa de envíos:');
        data.data.forEach((shipment, index) => {
          console.log(`\n${index + 1}. Envío:`);
          console.log(`   ID: ${shipment.id}`);
          console.log(`   Number: ${shipment.number || 'N/A'}`);
          console.log(`   Estado: ${shipment.status}`);
          console.log(`   Cliente: ${shipment.customer?.name || 'N/A'}`);
          console.log(`   Origen: ${shipment.origin || 'N/A'}`);
          console.log(`   Destino: ${shipment.destination || 'N/A'}`);
          console.log(`   Conductor: ${shipment.driver?.name || 'No asignado'}`);
          console.log(`   Vehículo: ${shipment.vehicle?.plate || 'No asignado'}`);
          console.log(`   Monto: ${shipment.amount || 'No definido'}`);
          console.log(`   Creado: ${shipment.createdAt || 'N/A'}`);
          
          // Buscar si contiene WDLXTI
          if (shipment.id?.includes('WDLXTI') || shipment.number === 'WDLXTI') {
            console.log('\n🎯 ¡ENVÍO WDLXTI ENCONTRADO!');
            console.log('   ✅ Este es el envío que necesitas aprobar');
            
            // Intentar actualizar este envío específico
            await tryUpdateShipment(shipment.id, adminToken);
          }
        });
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo envíos:', error.message);
  }
}

async function tryUpdateShipment(shipmentId, token) {
  console.log(`\n🔧 Intentando actualizar envío ${shipmentId}...`);
  
  // Obtener conductores para asignar
  let drivers = [];
  try {
    const response = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      drivers = data.data || [];
      console.log(`👤 Conductores disponibles: ${drivers.length}`);
    }
  } catch (error) {
    console.log('❌ Error obteniendo conductores:', error.message);
  }

  // Obtener vehículos para asignar
  let vehicles = [];
  try {
    const response = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      vehicles = data.data || [];
      console.log(`🚗 Vehículos disponibles: ${vehicles.length}`);
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículos:', error.message);
  }

  if (drivers.length > 0 && vehicles.length > 0) {
    const firstDriver = drivers[0];
    const firstVehicle = vehicles[0];
    
    console.log(`\n📝 Asignando conductor: ${firstDriver.name || firstDriver.id}`);
    console.log(`📝 Asignando vehículo: ${firstVehicle.plate || firstVehicle.id}`);
    
    // Intentar actualizar el envío
    try {
      const updateResponse = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'PATCH', {
        driverId: firstDriver.id,
        vehicleId: firstVehicle.id,
        amount: 50000 // Monto de ejemplo
      }, {
        'Authorization': `Bearer ${token}`
      });
      
      console.log(`\n🔄 Actualización - Status: ${updateResponse.statusCode}`);
      console.log(`📄 Response: ${updateResponse.body}`);
      
      if (updateResponse.statusCode === 200) {
        console.log('✅ ¡Envío actualizado exitosamente!');
        console.log('🎉 Ahora debería aparecer el botón de aprobación en el frontend');
      } else {
        console.log('❌ Error en actualización');
        
        // Intentar con PUT en lugar de PATCH
        console.log('\n🔄 Intentando con PUT...');
        try {
          const putResponse = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'PUT', {
            driverId: firstDriver.id,
            vehicleId: firstVehicle.id,
            amount: 50000
          }, {
            'Authorization': `Bearer ${token}`
          });
          
          console.log(`PUT - Status: ${putResponse.statusCode}`);
          console.log(`PUT - Body: ${putResponse.body}`);
        } catch (putError) {
          console.log('❌ PUT también falló:', putError.message);
        }
      }
    } catch (error) {
      console.log('❌ Error actualizando envío:', error.message);
    }
  } else {
    console.log('❌ No hay conductores o vehículos disponibles para asignar');
  }
}

findShipmentWDLXTI();
