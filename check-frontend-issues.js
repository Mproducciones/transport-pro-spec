// Verificar problemas del frontend y permisos
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

async function checkFrontendIssues() {
  console.log('🔍 Verificando problemas de frontend y permisos...\n');

  // 1. Login como admin
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

  // 2. Verificar conductores disponibles
  console.log('\n👥 Verificando conductores disponibles...');
  try {
    const response = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    console.log(`Drivers - Status: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log(`📊 Total conductores: ${data.data?.length || 0}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n👤 Conductores disponibles:');
        data.data.forEach((driver, index) => {
          console.log(`${index + 1}. ${driver.name} (${driver.status || 'N/A'})`);
          console.log(`   ID: ${driver.id}`);
          console.log(`   Teléfono: ${driver.phone || 'N/A'}`);
          console.log(`   Licencia: ${driver.licenseNumber || 'N/A'}`);
          console.log(`   Disponible: ${driver.available !== false ? '✅' : '❌'}`);
          console.log('');
        });
      } else {
        console.log('❌ No hay conductores disponibles');
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo conductores:', error.message);
  }

  // 3. Verificar vehículos disponibles
  console.log('🚗 Verificando vehículos disponibles...');
  try {
    const response = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    console.log(`Vehicles - Status: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log(`📊 Total vehículos: ${data.data?.length || 0}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n🚗 Vehículos disponibles:');
        data.data.forEach((vehicle, index) => {
          console.log(`${index + 1}. ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`);
          console.log(`   ID: ${vehicle.id}`);
          console.log(`   Tipo: ${vehicle.type || 'N/A'}`);
          console.log(`   Capacidad: ${vehicle.capacity || 'N/A'}`);
          console.log(`   Disponible: ${vehicle.available !== false ? '✅' : '❌'}`);
          console.log('');
        });
      } else {
        console.log('❌ No hay vehículos disponibles');
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículos:', error.message);
  }

  // 4. Verificar envío específico WDLXTI
  console.log('📦 Verificando envío WDLXTI...');
  try {
    const response = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const shipment = data.data?.find(s => s.id?.includes('WDLXTI') || s.number === 'WDLXTI');
      
      if (shipment) {
        console.log('✅ Envío WDLXTI encontrado:');
        console.log(`   ID: ${shipment.id}`);
        console.log(`   Estado: ${shipment.status}`);
        console.log(`   Cliente: ${shipment.customer?.name || 'N/A'}`);
        console.log(`   Conductor ID: ${shipment.driverId || 'No asignado'}`);
        console.log(`   Vehículo ID: ${shipment.vehicleId || 'No asignado'}`);
        console.log(`   Monto: ${shipment.amount || 'No definido'}`);
        
        // Verificar si se puede actualizar
        console.log('\n🔧 Probando actualizar envío...');
        try {
          const updateResponse = await makeRequest(`/api/v1/shipments/${shipment.id}`, 'PATCH', {
            driverId: 'test-driver-id',
            vehicleId: 'test-vehicle-id'
          }, {
            'Authorization': `Bearer ${adminToken}`
          });
          
          console.log(`Update - Status: ${updateResponse.statusCode}`);
          console.log(`Update - Body: ${updateResponse.body.substring(0, 200)}...`);
        } catch (error) {
          console.log(`❌ Error actualizando: ${error.message}`);
        }
      } else {
        console.log('❌ Envío WDLXTI no encontrado');
      }
    }
  } catch (error) {
    console.log('❌ Error verificando envío:', error.message);
  }

  // 5. Verificar endpoints de asignación
  console.log('\n🔍 Verificando endpoints de asignación...');
  const assignmentEndpoints = [
    '/api/v1/shipments/assign-driver',
    '/api/v1/shipments/assign-vehicle',
    '/api/v1/drivers/available',
    '/api/v1/vehicles/available'
  ];

  for (const endpoint of assignmentEndpoints) {
    try {
      const response = await makeRequest(endpoint, 'GET', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      
      console.log(`${endpoint}: Status ${response.statusCode}`);
      
      if (response.statusCode === 200) {
        console.log(`   ✅ Endpoint disponible`);
      }
    } catch (error) {
      console.log(`${endpoint}: ❌ No disponible (${error.message})`);
    }
  }

  console.log('\n📝 DIAGNÓSTICO:');
  console.log('1. Si no hay conductores/vehículos disponibles → Debes crearlos primero');
  console.log('2. Si los endpoints fallan → Problema de permisos o backend');
  console.log('3. Si todo existe → Problema de UI/UX del frontend');
  console.log('4. La vista lateral en lugar de modal es un issue de diseño');
}

checkFrontendIssues();
