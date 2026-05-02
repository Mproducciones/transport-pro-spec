// Verificar por qué no aparecen los botones de aprobar/rechazar
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

async function checkApprovalButtons() {
  console.log('🔍 Verificando botones de aprobar/rechazar...\n');

  // Login como admin
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

  if (!token) {
    console.log('❌ No se obtuvo token');
    return;
  }

  // Verificar envío WDLXTI específicamente
  const shipmentId = 'cmon7dttu000tv904pqwdlxti';
  console.log(`\n📦 Verificando envío ${shipmentId}...`);
  
  try {
    const response = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const shipment = data.data;
      
      console.log('\n📋 ESTADO ACTUAL DEL ENVÍO:');
      console.log(`   ID: ${shipment.id}`);
      console.log(`   Estado: ${shipment.status}`);
      console.log(`   Cliente: ${shipment.customer?.name}`);
      console.log(`   Origen: ${shipment.origin}`);
      console.log(`   Destino: ${shipment.destination}`);
      console.log(`   Conductor: ${shipment.driver?.fullName || 'No asignado'}`);
      console.log(`   Vehículo: ${shipment.vehicle?.plate || 'No asignado'}`);
      console.log(`   Monto: ${shipment.amount || 'No definido'}`);
      console.log(`   Monto total: ${shipment.totalAmount || 'No definido'}`);
      console.log(`   Estado de pago: ${shipment.paymentStatus || 'N/A'}`);
      console.log(`   Nota decisión: ${shipment.decisionNote || 'N/A'}`);
      
      // Verificar requisitos para aprobación
      console.log('\n🔍 REQUISITOS PARA APROBACIÓN:');
      const requirements = {
        'Conductor asignado': !!shipment.driverId,
        'Vehículo asignado': !!shipment.vehicleId,
        'Monto definido': !!(shipment.amount || shipment.totalAmount),
        'Estado pendiente': shipment.status === 'pendiente'
      };
      
      Object.entries(requirements).forEach(([req, met]) => {
        console.log(`   ${met ? '✅' : '❌'} ${req}`);
      });
      
      const allMet = Object.values(requirements).every(Boolean);
      console.log(`\n🎯 ¿Todos los requisitos cumplidos? ${allMet ? '✅ SÍ' : '❌ NO'}`);
      
      if (!allMet) {
        console.log('\n🚫 LOS BOTONES NO APARECEN PORQUE FALTAN REQUISITOS');
        console.log('Solución: Completar los requisitos faltantes');
      } else {
        console.log('\n✅ REQUISITOS CUMPLIDOS - LOS BOTONES DEBERÍAN APARECER');
        console.log('Si no aparecen, puede ser un problema del frontend');
      }
      
      // Verificar si el envío ya fue aprobado/rechazado
      if (shipment.status !== 'pendiente') {
        console.log(`\n⚠️  ENVÍO YA PROCESADO - Estado: ${shipment.status}`);
        console.log('Los botones no aparecen porque ya no está pendiente');
      }
      
    } else {
      console.log(`❌ Error obteniendo envío: ${response.statusCode}`);
    }
  } catch (error) {
    console.log('❌ Error verificando envío:', error.message);
  }

  // Verificar otros envíos pendientes
  console.log('\n🔍 Buscando otros envíos pendientes...');
  try {
    const response = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const pendingShipments = data.data?.filter(s => s.status === 'pendiente') || [];
      
      console.log(`📊 Envíos pendientes encontrados: ${pendingShipments.length}`);
      
      if (pendingShipments.length > 0) {
        console.log('\n📋 LISTA DE ENVÍOS PENDIENTES:');
        pendingShipments.forEach((shipment, index) => {
          console.log(`\n${index + 1}. ${shipment.id?.substring(-6).toUpperCase()}`);
          console.log(`   Cliente: ${shipment.customer?.name}`);
          console.log(`   Origen: ${shipment.origin}`);
          console.log(`   Destino: ${shipment.destination}`);
          console.log(`   Conductor: ${shipment.driver?.fullName || 'No asignado'}`);
          console.log(`   Vehículo: ${shipment.vehicle?.plate || 'No asignado'}`);
          console.log(`   Monto: ${shipment.amount || 'No definido'}`);
          
          const hasRequirements = !!(shipment.driverId && shipment.vehicleId && (shipment.amount || shipment.totalAmount));
          console.log(`   ¿Listo para aprobar? ${hasRequirements ? '✅' : '❌ (faltan datos)'}`);
        });
      } else {
        console.log('❌ No hay envíos pendientes para aprobar');
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo envíos:', error.message);
  }

  console.log('\n📝 DIAGNÓSTICO:');
  console.log('1. Si el envío no tiene conductor/vehículo/monto → Los botones no aparecen');
  console.log('2. Si el envío ya fue aprobado/rechazado → Los botones no aparecen');
  console.log('3. Si todo está completo y está pendiente → Deberían aparecer los botones');
  console.log('4. Si no aparecen siendo válido → Problema del componente ResponsiveShipmentDetail');
}

checkApprovalButtons();
