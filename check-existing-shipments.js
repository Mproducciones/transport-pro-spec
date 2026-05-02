// Verificar envíos existentes para que el administrador pueda interactuar
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

async function checkExistingShipments() {
  console.log('📦 Verificando envíos existentes para interacción...\n');

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

  // Obtener todos los envíos
  try {
    const response = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      const shipments = data.data || [];
      
      console.log(`📊 Total de envíos encontrados: ${shipments.length}\n`);

      // Agrupar por estado
      const byStatus = shipments.reduce((acc, shipment) => {
        acc[shipment.status] = (acc[shipment.status] || []).concat(shipment);
        return acc;
      }, {});

      // Mostrar envíos pendientes (para aprobar/rechazar)
      if (byStatus.pendiente && byStatus.pendiente.length > 0) {
        console.log('🔵 ENVÍOS PENDIENTES (para aprobar/rechazar):');
        byStatus.pendiente.forEach((shipment, index) => {
          console.log(`${index + 1}. ${shipment.id?.substring(-6).toUpperCase()}`);
          console.log(`   Ruta: ${shipment.origin} → ${shipment.destination}`);
          console.log(`   Cliente: ${shipment.customer?.name}`);
          console.log(`   Monto: $${shipment.amount?.toLocaleString('es-CL')}`);
          console.log(`   Conductor: ${shipment.driver?.fullName || '❌ Sin asignar'}`);
          console.log(`   Vehículo: ${shipment.vehicle?.plate || '❌ Sin asignar'}`);
          
          const canApprove = shipment.driver && shipment.vehicle && shipment.amount;
          console.log(`   ¿Listo para aprobar? ${canApprove ? '✅ SÍ' : '❌ Faltan datos'}`);
          console.log('');
        });
      } else {
        console.log('❌ No hay envíos pendientes para aprobar');
      }

      // Mostrar envíos en otros estados
      const otherStatuses = ['confirmado', 'recogido', 'en_transito', 'entregado'];
      otherStatuses.forEach(status => {
        if (byStatus[status] && byStatus[status].length > 0) {
          console.log(`📋 ENVÍOS ${status.toUpperCase()}:`);
          byStatus[status].forEach((shipment, index) => {
            console.log(`${index + 1}. ${shipment.id?.substring(-6).toUpperCase()}`);
            console.log(`   Ruta: ${shipment.origin} → ${shipment.destination}`);
            console.log(`   Cliente: ${shipment.customer?.name}`);
            console.log(`   Estado: ${status}`);
            console.log('');
          });
        }
      });

      // Crear envío de prueba si no hay ninguno
      if (shipments.length === 0) {
        console.log('🔧 Creando envío de prueba manualmente...\n');
        
        try {
          const createResponse = await makeRequest('/api/v1/shipments', 'POST', {
            origin: 'Santiago, Providencia',
            destination: 'Viña del Mar, Centro',
            cargoType: 'caja',
            cargoQuantity: 3,
            cargoWeightKg: 280,
            cargoVolumeM3: 1.8,
            requiresHelper: false,
            scheduledPickup: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            scheduledDelivery: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            amount: 75000,
            description: 'Envío de prueba para demostración',
            customerId: 'demo-customer-id', // ID de cliente demo
            customer: {
              id: 'demo-customer-id',
              name: 'Cliente Demo',
              phone: '+56912345678',
              email: 'demo@cliente.com'
            }
          }, {
            'Authorization': `Bearer ${token}`
          });

          if (createResponse.statusCode === 201) {
            const createdData = JSON.parse(createResponse.body);
            console.log('✅ Envío de prueba creado:');
            console.log(`   ID: ${createdData.data.id?.substring(-6).toUpperCase()}`);
            console.log(`   Ruta: ${createdData.data.origin} → ${createdData.data.destination}`);
            console.log(`   Estado: PENDIENTE (para aprobar)`);
          } else {
            console.log('❌ No se pudo crear envío de prueba');
          }
        } catch (error) {
          console.log('❌ Error creando envío de prueba:', error.message);
        }
      }

      console.log('🌐 PARA PROBAR EN EL FRONTEND:');
      console.log('1. Ir a: http://localhost:5174/');
      console.log('2. Login: admin@demo.com / Admin123!');
      console.log('3. Buscar envíos con los IDs mostrados arriba');
      console.log('4. Click en cualquier envío para ver el modal rediseñado');
      console.log('5. Probar las siguientes interacciones:');
      console.log('   - Aprobar/rechazar envíos pendientes');
      console.log('   - Ver línea de tiempo en diferentes estados');
      console.log('   - Asignar conductor/vehículo si faltan');
      console.log('   - Ver mapa y checklist');
      
    } else {
      console.log(`❌ Error obteniendo envíos: ${response.statusCode}`);
    }
  } catch (error) {
    console.log('❌ Error verificando envíos:', error.message);
  }
}

checkExistingShipments();
