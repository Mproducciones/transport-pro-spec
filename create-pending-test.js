// Crear un envío pendiente de prueba para aprobación
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

async function createPendingTest() {
  console.log('🔧 Creando envío pendiente de prueba...\n');

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

  // Obtener primer cliente para el envío
  let customer = null;
  try {
    const customersResponse = await makeRequest('/api/v1/customers', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (customersResponse.statusCode === 200) {
      const customersData = JSON.parse(customersResponse.body);
      const customers = customersData.data || [];
      if (customers.length > 0) {
        customer = customers[0];
        console.log(`👥 Usando cliente: ${customer.name}`);
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo cliente:', error.message);
  }

  if (!customer) {
    console.log('❌ No se encontró cliente');
    return;
  }

  // Crear envío pendiente directamente (bypass de validación)
  try {
    const shipmentData = {
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
      totalAmount: 75000,
      paymentStatus: 'pendiente',
      status: 'pendiente',
      description: 'Envío de prueba para aprobación administrativa',
      customerId: customer.id,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email || ''
      },
      // Sin conductor ni vehículo inicialmente
      driverId: null,
      driver: null,
      vehicleId: null,
      vehicle: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const response = await makeRequest('/api/v1/shipments', 'POST', shipmentData, {
      'Authorization': `Bearer ${token}`
    });

    if (response.statusCode === 201) {
      const createdData = JSON.parse(response.body);
      const shipment = createdData.data;
      
      console.log('✅ Envío pendiente creado exitosamente:');
      console.log(`   ID: ${shipment.id?.substring(-6).toUpperCase()}`);
      console.log(`   Ruta: ${shipment.origin} → ${shipment.destination}`);
      console.log(`   Cliente: ${shipment.customer.name}`);
      console.log(`   Estado: PENDIENTE`);
      console.log(`   Monto: $${shipment.amount?.toLocaleString('es-CL')}`);
      console.log(`   Conductor: Sin asignar`);
      console.log(`   Vehículo: Sin asignar`);
      console.log('');

      // Ahora asignar conductor y vehículo para que esté listo para aprobar
      console.log('🔧 Asignando conductor y vehículo...\n');

      // Obtener conductores y vehículos
      let drivers = [];
      let vehicles = [];

      try {
        const driversResponse = await makeRequest('/api/v1/drivers', 'GET', null, {
          'Authorization': `Bearer ${token}`
        });
        
        if (driversResponse.statusCode === 200) {
          const driversData = JSON.parse(driversResponse.body);
          drivers = driversData.data || [];
        }

        const vehiclesResponse = await makeRequest('/api/v1/vehicles', 'GET', null, {
          'Authorization': `Bearer ${token}`
        });
        
        if (vehiclesResponse.statusCode === 200) {
          const vehiclesData = JSON.parse(vehiclesResponse.body);
          vehicles = vehiclesData.data || [];
        }
      } catch (error) {
        console.log('❌ Error obteniendo conductor/vehículo:', error.message);
      }

      if (drivers.length > 0 && vehicles.length > 0) {
        const driver = drivers[0];
        const vehicle = vehicles[0];

        const assignResponse = await makeRequest(`/api/v1/shipments/${shipment.id}`, 'PATCH', {
          driverId: driver.id,
          vehicleId: vehicle.id
        }, {
          'Authorization': `Bearer ${token}`
        });

        if (assignResponse.statusCode === 200) {
          console.log('✅ Conductor y vehículo asignados:');
          console.log(`   Conductor: ${driver.fullName}`);
          console.log(`   Vehículo: ${vehicle.plate} (${vehicle.kind || 'N/A'})`);
          console.log('');

          console.log('🎯 ENVÍO LISTO PARA APROBAR:');
          console.log(`✅ Estado: PENDIENTE`);
          console.log(`✅ Conductor: Asignado`);
          console.log(`✅ Vehículo: Asignado`);
          console.log(`✅ Monto: Definido`);
          console.log('');
          console.log('🌐 PARA PROBAR LA APROBACIÓN:');
          console.log('1. Ir a: http://localhost:5174/');
          console.log('2. Login: admin@demo.com / Admin123!');
          console.log(`3. Buscar envío: ${shipment.id?.substring(-6).toUpperCase()}`);
          console.log('4. Click en el envío para abrir el modal');
          console.log('5. Ver los botones "Aprobar" y "Rechazar"');
          console.log('6. Probar la funcionalidad de aprobación');
        } else {
          console.log('❌ Error asignando conductor/vehículo');
        }
      } else {
        console.log('❌ No hay conductores o vehículos disponibles');
      }

    } else {
      console.log(`❌ Error creando envío: ${response.statusCode}`);
      console.log(`   ${response.body}`);
    }
  } catch (error) {
    console.log('❌ Error creando envío:', error.message);
  }
}

createPendingTest();
