// Script para arreglar el envío WDLXTI asignando conductor, vehículo y monto
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

async function fixShipmentWDLXTI() {
  console.log('🔧 Arreglando envío WDLXTI...\n');

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
      console.log('✅ Login admin exitoso');
    }
  } catch (error) {
    console.log('❌ Error login:', error.message);
    return;
  }

  const shipmentId = 'cmon7dttu000tv904pqwdlxti';

  // 1. Obtener primer conductor disponible
  let driverId = null;
  try {
    const response = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.data && data.data.length > 0) {
        driverId = data.data[0].id;
        console.log(`✅ Conductor seleccionado: ${data.data[0].name || data.data[0].id}`);
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo conductor:', error.message);
  }

  // 2. Obtener primer vehículo disponible
  let vehicleId = null;
  try {
    const response = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.data && data.data.length > 0) {
        vehicleId = data.data[0].id;
        console.log(`✅ Vehículo seleccionado: ${data.data[0].plate || data.data[0].id}`);
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículo:', error.message);
  }

  if (!driverId || !vehicleId) {
    console.log('❌ No se pudo obtener conductor o vehículo');
    return;
  }

  // 3. Actualizar el envío con conductor, vehículo y monto
  console.log('\n🔄 Actualizando envío WDLXTI...');
  try {
    const updateData = {
      driverId: driverId,
      vehicleId: vehicleId,
      amount: 75000 // Monto razonable para Santiago -> Viña del Mar
    };

    const response = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'PATCH', updateData, {
      'Authorization': `Bearer ${token}`
    });
    
    console.log(`📊 Update Status: ${response.statusCode}`);
    console.log(`📄 Response: ${response.body}`);
    
    if (response.statusCode === 200) {
      console.log('\n🎉 ¡ENVÍO ACTUALIZADO EXITOSAMENTE!');
      console.log('✅ Conductor asignado');
      console.log('✅ Vehículo asignado');
      console.log('✅ Monto definido: $75,000');
      console.log('\n🎯 Ahora en el frontend deberías ver:');
      console.log('   - El botón de aprobación habilitado');
      console.log('   - Checklist completo (6/6)');
      console.log('   - Opción de aprobar el envío');
      
      console.log('\n🌐 Para verificar:');
      console.log('1. Refresca el frontend: http://localhost:5173');
      console.log('2. Login como admin@demo.com');
      console.log('3. Busca el envío WDLXTI');
      console.log('4. El botón de aprobación debería aparecer');
    } else {
      console.log('❌ Error en actualización');
      
      // Intentar con PUT
      console.log('\n🔄 Intentando con PUT...');
      try {
        const putResponse = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'PUT', updateData, {
          'Authorization': `Bearer ${token}`
        });
        
        console.log(`PUT Status: ${putResponse.statusCode}`);
        console.log(`PUT Response: ${putResponse.body}`);
        
        if (putResponse.statusCode === 200) {
          console.log('🎉 ¡Actualización con PUT exitosa!');
        }
      } catch (putError) {
        console.log('❌ PUT también falló:', putError.message);
      }
    }
  } catch (error) {
    console.log('❌ Error actualizando envío:', error.message);
  }

  // 4. Verificar estado final del envío
  console.log('\n🔍 Verificando estado final...');
  try {
    const response = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log('📊 Estado final del envío:');
      console.log(`   ID: ${data.data?.id}`);
      console.log(`   Estado: ${data.data?.status}`);
      console.log(`   Conductor: ${data.data?.driver?.name || 'No asignado'}`);
      console.log(`   Vehículo: ${data.data?.vehicle?.plate || 'No asignado'}`);
      console.log(`   Monto: ${data.data?.amount || 'No definido'}`);
    }
  } catch (error) {
    console.log('❌ Error verificando estado final:', error.message);
  }
}

fixShipmentWDLXTI();
