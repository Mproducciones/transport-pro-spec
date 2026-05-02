// Acceder como cliente y generar solicitudes variadas para pruebas
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

async function createVariedClientRequests() {
  console.log('👥 ACCEDIENDO COMO CLIENTE Y GENERANDO SOLICITUDES VARIADAS\n');

  // 1. Obtener clientes disponibles
  let clients = [];
  let adminToken = null;
  
  try {
    const adminResponse = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (adminResponse.statusCode === 200) {
      const adminData = JSON.parse(adminResponse.body);
      adminToken = adminData.data?.token;

      const clientsResponse = await makeRequest('/api/v1/customers', 'GET', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      
      if (clientsResponse.statusCode === 200) {
        const clientsData = JSON.parse(clientsResponse.body);
        clients = clientsData.data || [];
        console.log(`✅ Clientes disponibles: ${clients.length}`);
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo clientes:', error.message);
    return;
  }

  if (clients.length === 0) {
    console.log('❌ No hay clientes disponibles');
    return;
  }

  // 2. Función para login de cliente
  async function loginClient(client) {
    const possibleEmails = [
      client.email,
      `${client.name.toLowerCase().replace(/\s+/g, '.')}@demo.com`,
      `${client.name.toLowerCase().replace(/\s+/g, '')}@demo.com`
    ];
    
    const possiblePasswords = ['Cliente123!', '123456', 'password', 'demo123'];

    for (const email of possibleEmails) {
      for (const password of possiblePasswords) {
        try {
          const response = await makeRequest('/api/v1/auth/login', 'POST', {
            email: email,
            password: password
          });
          
          if (response.statusCode === 200) {
            const data = JSON.parse(response.body);
            return data.data?.token;
          }
        } catch (error) {
          // Continuar intentando
        }
      }
    }
    return null;
  }

  console.log('\n📦 3. CREANDO SOLICITUDES PARA HOY (HPY)');
  
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0);
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0, 0);

  const todayRequests = [
    {
      description: 'Envío urgente de documentos legales - Hoy',
      origin: 'Santiago, Centro',
      destination: 'Providencia, Las Condes',
      cargoType: 'caja',
      cargoQuantity: 2,
      cargoWeightKg: 15,
      cargoVolumeM3: 0.5,
      requiresHelper: false,
      scheduledPickup: new Date(todayStart.getTime() + 1 * 60 * 60 * 1000).toISOString(), // +1 hora
      scheduledDelivery: new Date(todayStart.getTime() + 3 * 60 * 60 * 1000).toISOString(), // +3 horas
      amount: 35000,
      priority: 'urgente'
    },
    {
      description: 'Entrega de equipo de oficina - Hoy',
      origin: 'Providencia, Centro',
      destination: 'Vitacura, Manquehue',
      cargoType: 'caja',
      cargoQuantity: 4,
      cargoWeightKg: 80,
      cargoVolumeM3: 1.2,
      requiresHelper: true,
      scheduledPickup: new Date(todayStart.getTime() + 2 * 60 * 60 * 1000).toISOString(), // +2 horas
      scheduledDelivery: new Date(todayStart.getTime() + 4 * 60 * 60 * 1000).toISOString(), // +4 horas
      amount: 55000,
      priority: 'normal'
    },
    {
      description: 'Muestras médicas - Hoy',
      origin: 'La Reina, Centro',
      destination: 'Ñuñoa, Plaza',
      cargoType: 'caja',
      cargoQuantity: 1,
      cargoWeightKg: 5,
      cargoVolumeM3: 0.2,
      requiresHelper: false,
      scheduledPickup: new Date(todayStart.getTime() + 3 * 60 * 60 * 1000).toISOString(), // +3 horas
      scheduledDelivery: new Date(todayStart.getTime() + 5 * 60 * 60 * 1000).toISOString(), // +5 horas
      amount: 25000,
      priority: 'urgente'
    }
  ];

  let createdToday = 0;
  for (let i = 0; i < Math.min(todayRequests.length, clients.length); i++) {
    const client = clients[i];
    const request = todayRequests[i];
    
    const clientToken = await loginClient(client);
    if (!clientToken) {
      console.log(`❌ No se pudo autenticar al cliente: ${client.name}`);
      continue;
    }

    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', request, {
        'Authorization': `Bearer ${clientToken}`
      });

      if (response.statusCode === 201) {
        const data = JSON.parse(response.body);
        createdToday++;
        console.log(`✅ Envío de hoy creado: ${data.data.id?.substring(-6).toUpperCase()}`);
        console.log(`   Cliente: ${client.name}`);
        console.log(`   Ruta: ${request.origin} → ${request.destination}`);
        console.log(`   Horario: ${new Date(request.scheduledPickup).toLocaleTimeString('es-CL')} - ${new Date(request.scheduledDelivery).toLocaleTimeString('es-CL')}`);
        console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío de hoy: ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío de hoy:`, error.message);
    }
  }

  console.log(`📊 Envíos de hoy creados: ${createdToday}\n`);

  console.log('📅 4. CREANDO SOLICITUDES PARA DÍAS POSTERIORES');
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 9, 0, 0);

  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const futureRequests = [
    {
      description: 'Equipamiento de construcción - Mañana',
      origin: 'San Bernardo, Centro',
      destination: 'Puente Alto, La Florida',
      cargoType: 'pallet',
      cargoQuantity: 6,
      cargoWeightKg: 450,
      cargoVolumeM3: 2.8,
      requiresHelper: true,
      scheduledPickup: new Date(tomorrowStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(tomorrowStart.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      amount: 95000,
      priority: 'normal'
    },
    {
      description: 'Productos alimenticios - Pasado mañana',
      origin: 'Quilicura, Centro',
      destination: 'Huechuraba, Centenario',
      cargoType: 'caja',
      cargoQuantity: 8,
      cargoWeightKg: 120,
      cargoVolumeM3: 1.5,
      requiresHelper: false,
      scheduledPickup: new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      amount: 45000,
      priority: 'normal'
    },
    {
      description: 'Materiales de oficina - Próxima semana',
      origin: 'La Florida, Centro',
      destination: 'Puente Alto, Bajos',
      cargoType: 'caja',
      cargoQuantity: 3,
      cargoWeightKg: 60,
      cargoVolumeM3: 0.8,
      requiresHelper: false,
      scheduledPickup: new Date(nextWeek.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(nextWeek.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      amount: 38000,
      priority: 'bajo'
    }
  ];

  let createdFuture = 0;
  for (let i = 0; i < Math.min(futureRequests.length, clients.length - createdToday); i++) {
    const client = clients[i + createdToday];
    const request = futureRequests[i];
    
    const clientToken = await loginClient(client);
    if (!clientToken) {
      console.log(`❌ No se pudo autenticar al cliente: ${client.name}`);
      continue;
    }

    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', request, {
        'Authorization': `Bearer ${clientToken}`
      });

      if (response.statusCode === 201) {
        const data = JSON.parse(response.body);
        createdFuture++;
        console.log(`✅ Envío futuro creado: ${data.data.id?.substring(-6).toUpperCase()}`);
        console.log(`   Cliente: ${client.name}`);
        console.log(`   Ruta: ${request.origin} → ${request.destination}`);
        console.log(`   Fecha: ${new Date(request.scheduledPickup).toLocaleDateString('es-CL')}`);
        console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío futuro: ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío futuro:`, error.message);
    }
  }

  console.log(`📊 Envíos futuros creados: ${createdFuture}\n`);

  console.log('🚛 5. CREANDO ENVÍOS "EN CAMINO" (simulando proceso avanzado)');
  
  // Para crear envíos "en camino", necesitamos crearlos y luego actualizar su estado
  const inTransitRequests = [
    {
      description: 'Electrónicos en tránsito',
      origin: 'Valparaíso, Puerto',
      destination: 'Santiago, Centro',
      cargoType: 'caja',
      cargoQuantity: 3,
      cargoWeightKg: 85,
      cargoVolumeM3: 1.1,
      requiresHelper: true,
      scheduledPickup: new Date(today.getTime() - 4 * 60 * 60 * 1000).toISOString(), // -4 horas
      scheduledDelivery: new Date(today.getTime() + 2 * 60 * 60 * 1000).toISOString(), // +2 horas
      amount: 75000,
      priority: 'normal'
    },
    {
      description: 'Ropa en tránsito',
      origin: 'Viña del Mar, Centro',
      destination: 'Quilpué, Centro',
      cargoType: 'caja',
      cargoQuantity: 5,
      cargoWeightKg: 45,
      cargoVolumeM3: 0.9,
      requiresHelper: false,
      scheduledPickup: new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString(), // -2 horas
      scheduledDelivery: new Date(today.getTime() + 1 * 60 * 60 * 1000).toISOString(), // +1 hora
      amount: 42000,
      priority: 'normal'
    }
  ];

  let createdInTransit = 0;
  for (let i = 0; i < Math.min(inTransitRequests.length, clients.length - createdToday - createdFuture); i++) {
    const client = clients[i + createdToday + createdFuture];
    const request = inTransitRequests[i];
    
    const clientToken = await loginClient(client);
    if (!clientToken) {
      console.log(`❌ No se pudo autenticar al cliente: ${client.name}`);
      continue;
    }

    try {
      // Crear envío
      const createResponse = await makeRequest('/api/v1/shipments', 'POST', request, {
        'Authorization': `Bearer ${clientToken}`
      });

      if (createResponse.statusCode === 201) {
        const createdData = JSON.parse(createResponse.body);
        const shipmentId = createdData.data.id;

        // Actualizar estado como admin para simular "en camino"
        const updateResponse = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'PATCH', {
          status: 'en_transito',
          pickedUpAt: new Date(today.getTime() - 1 * 60 * 60 * 1000).toISOString() // -1 hora
        }, {
          'Authorization': `Bearer ${adminToken}`
        });

        if (updateResponse.statusCode === 200) {
          createdInTransit++;
          console.log(`✅ Envío en camino creado: ${shipmentId?.substring(-6).toUpperCase()}`);
          console.log(`   Cliente: ${client.name}`);
          console.log(`   Ruta: ${request.origin} → ${request.destination}`);
          console.log(`   Estado: EN TRÁNSITO`);
          console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
          console.log('');
        }
      }
    } catch (error) {
      console.log(`❌ Error creando envío en camino:`, error.message);
    }
  }

  console.log(`📊 Envíos en camino creados: ${createdInTransit}\n`);

  console.log('✅ 6. CREANDO ENVÍOS YA TERMINADOS');
  
  const completedRequests = [
    {
      description: 'Libros entregados',
      origin: 'Santiago, Providencia',
      destination: 'Las Condes, Manquehue',
      cargoType: 'caja',
      cargoQuantity: 2,
      cargoWeightKg: 25,
      cargoVolumeM3: 0.4,
      requiresHelper: false,
      scheduledPickup: new Date(today.getTime() - 8 * 60 * 60 * 1000).toISOString(), // -8 horas
      scheduledDelivery: new Date(today.getTime() - 4 * 60 * 60 * 1000).toISOString(), // -4 horas
      amount: 28000,
      priority: 'normal'
    },
    {
      description: 'Muebles entregados',
      origin: 'Maipú, Centro',
      destination: 'Cerrillos, Centro',
      cargoType: 'caja',
      cargoQuantity: 1,
      cargoWeightKg: 150,
      cargoVolumeM3: 2.5,
      requiresHelper: true,
      scheduledPickup: new Date(today.getTime() - 12 * 60 * 60 * 1000).toISOString(), // -12 horas
      scheduledDelivery: new Date(today.getTime() - 6 * 60 * 60 * 1000).toISOString(), // -6 horas
      amount: 88000,
      priority: 'normal'
    }
  ];

  let createdCompleted = 0;
  for (let i = 0; i < Math.min(completedRequests.length, clients.length - createdToday - createdFuture - createdInTransit); i++) {
    const client = clients[i + createdToday + createdFuture + createdInTransit];
    const request = completedRequests[i];
    
    const clientToken = await loginClient(client);
    if (!clientToken) {
      console.log(`❌ No se pudo autenticar al cliente: ${client.name}`);
      continue;
    }

    try {
      // Crear envío
      const createResponse = await makeRequest('/api/v1/shipments', 'POST', request, {
        'Authorization': `Bearer ${clientToken}`
      });

      if (createResponse.statusCode === 201) {
        const createdData = JSON.parse(createResponse.body);
        const shipmentId = createdData.data.id;

        // Actualizar estado como completado
        const updateResponse = await makeRequest(`/api/v1/shipments/${shipmentId}`, 'PATCH', {
          status: 'entregado',
          pickedUpAt: new Date(today.getTime() - 7 * 60 * 60 * 1000).toISOString(), // -7 horas
          deliveredAt: new Date(today.getTime() - 4 * 60 * 60 * 1000).toISOString(), // -4 horas
          deliveredToName: 'Receptor Autorizado'
        }, {
          'Authorization': `Bearer ${adminToken}`
        });

        if (updateResponse.statusCode === 200) {
          createdCompleted++;
          console.log(`✅ Envío completado creado: ${shipmentId?.substring(-6).toUpperCase()}`);
          console.log(`   Cliente: ${client.name}`);
          console.log(`   Ruta: ${request.origin} → ${request.destination}`);
          console.log(`   Estado: ENTREGADO`);
          console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
          console.log('');
        }
      }
    } catch (error) {
      console.log(`❌ Error creando envío completado:`, error.message);
    }
  }

  console.log(`📊 Envíos completados creados: ${createdCompleted}\n`);

  // Resumen final
  console.log('📊 RESUMEN DE SOLICITUDES CREADAS:');
  console.log(`✅ Envíos de hoy: ${createdToday}`);
  console.log(`✅ Envíos futuros: ${createdFuture}`);
  console.log(`✅ Envíos en camino: ${createdInTransit}`);
  console.log(`✅ Envíos completados: ${createdCompleted}`);
  console.log(`📈 Total nuevos envíos: ${createdToday + createdFuture + createdInTransit + createdCompleted}`);
  
  console.log('\n🌐 AHORA PUEDES PROBAR COMO ADMINISTRADOR:');
  console.log('1. Ir a: http://localhost:5174/');
  console.log('2. Login: admin@demo.com / Admin123!');
  console.log('3. Ver envíos PENDIENTES para aprobar');
  console.log('4. Ver envíos EN TRÁNSITO con línea de tiempo activa');
  console.log('5. Ver envíos ENTREGADOS con proceso completo');
  console.log('6. Probar el modal rediseñado en diferentes estados');
  
  console.log('\n🎯 PRÓXIMO PASO: Pruebas del panel de conductor');
}

createVariedClientRequests();
