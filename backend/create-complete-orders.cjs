#!/usr/bin/env node

/**
 * Script para crear un sistema completo de pedidos/envíos con datos de prueba
 * para probar todo el flujo del sistema
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createCompleteOrdersSystem() {
  console.log('📦 Creando sistema completo de pedidos y envíos...\n');

  try {
    // Verificar si ya existen datos
    const existingTenants = await prisma.tenant.count();
    if (existingTenants > 0) {
      console.log('ℹ️  La base de datos ya tiene datos. Creando pedidos adicionales...\n');
    }

    // Obtener o crear tenant demo
    let tenant = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
    
    if (!tenant) {
      console.log('🏢 Creando tenant demo...');
      tenant = await prisma.tenant.create({
        data: {
          name: 'Transporte Demo Pro',
          slug: 'demo',
          subscription: {
            create: {
              status: 'active',
              billingCycle: 'monthly',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            }
          }
        }
      });

      // Crear company
      await prisma.company.create({
        data: {
          tenantId: tenant.id,
          legalName: 'Transporte Demo Pro S.A.',
          taxId: '76.123.456-7',
          address: 'Av. Principal 123, Santiago, Chile',
          phone: '+56 2 2345 6789',
          pricingBaseFee: 5000,
          pricingPerKg: 0.05,
          pricingPerM3: 0.10,
          pricingMinimumCharge: 10000,
          driverCommissionPercent: 40,
        }
      });
      console.log('✅ Tenant y empresa creados\n');
    }

    // Crear usuarios principales si no existen
    console.log('👤 Verificando usuarios principales...');
    
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@demo.com', role: 'admin' } });
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('Admin123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'admin@demo.com',
          passwordHash: hashedPassword,
          role: 'admin',
        }
      });
      console.log('✅ Admin creado');
    }

    const clienteUser = await prisma.user.findFirst({ where: { email: 'cliente@demo.com', role: 'cliente' } });
    if (!clienteUser) {
      const hashedPassword = await bcrypt.hash('Cliente123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'cliente@demo.com',
          passwordHash: hashedPassword,
          role: 'cliente',
        }
      });
      console.log('✅ Cliente creado');
    }

    const conductorUser = await prisma.user.findFirst({ where: { email: 'conductor@demo.com', role: 'conductor' } });
    if (!conductorUser) {
      const hashedPassword = await bcrypt.hash('Conductor123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'conductor@demo.com',
          passwordHash: hashedPassword,
          role: 'conductor',
        }
      });
      console.log('✅ Conductor creado');
    }

    // Crear conductores adicionales
    console.log('\n🚛 Creando conductores...');
    const drivers = [];
    const existingDrivers = await prisma.driver.count({ where: { tenantId: tenant.id } });
    
    for (let i = existingDrivers + 1; i <= 5; i++) {
      const driver = await prisma.driver.create({
        data: {
          tenantId: tenant.id,
          fullName: `Conductor ${i}`,
          taxId: `12.345.67${i}-9`,
          phone: `+56 9 1234 567${i}`,
          licenseNumber: `CH12345678${i}`,
          status: i <= 3 ? 'activo' : 'inactivo',
        }
      });
      drivers.push(driver);

      // Crear usuario para cada conductor
      const driverEmail = `conductor${i}@demo.com`;
      const driverPassword = await bcrypt.hash('Conductor123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: driverEmail,
          passwordHash: driverPassword,
          role: 'conductor',
          driverId: driver.id,
        }
      });

      // Crear vehículo para cada conductor activo
      if (i <= 3) {
        await prisma.vehicle.create({
          data: {
            tenantId: tenant.id,
            plate: `ABC${100 + i}`,
            kind: 'Camión',
            status: 'disponible',
          }
        });
      }
    }
    console.log(`✅ ${drivers.length} conductores creados`);

    // Crear clientes adicionales
    console.log('\n👥 Creando clientes...');
    const customers = [];
    const existingCustomers = await prisma.customer.count({ where: { tenantId: tenant.id } });
    
    for (let i = existingCustomers + 1; i <= 8; i++) {
      const customer = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name: `Cliente ${i}`,
          taxId: `76.555.44${i}-3`,
          email: `cliente${i}@demo.com`,
          phone: `+56 2 5555 444${i}`,
        }
      });
      customers.push(customer);

      // Crear usuario para cada cliente
      const customerEmail = `cliente${i}@demo.com`;
      const customerPassword = await bcrypt.hash('Cliente123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: customerEmail,
          passwordHash: customerPassword,
          role: 'cliente',
          customerId: customer.id,
        }
      });
    }
    console.log(`✅ ${customers.length} clientes creados`);

    // Crear envíos/pedidos completos solo si hay clientes
    console.log('\n📦 Creando envíos/pedidos completos...');
    const shipments = [];
    
    if (customers.length === 0) {
      console.log('⚠️  No hay clientes disponibles, omitiendo creación de envíos');
    } else {
      const existingShipments = await prisma.shipment.count({ where: { tenantId: tenant.id } });
      
      const routes = [
        { origin: 'Santiago, Chile', destination: 'Valparaíso, Chile', distance: 120 },
        { origin: 'Concepción, Chile', destination: 'Temuco, Chile', distance: 220 },
        { origin: 'Antofagasta, Chile', destination: 'La Serena, Chile', distance: 450 },
        { origin: 'Rancagua, Chile', destination: 'Curicó, Chile', distance: 80 },
        { origin: 'Talca, Chile', destination: 'Chillán, Chile', distance: 150 },
        { origin: 'Puerto Montt, Chile', destination: 'Osorno, Chile', distance: 100 },
        { origin: 'La Serena, Chile', destination: 'Coquimbo, Chile', distance: 60 },
        { origin: 'Valdivia, Chile', destination: 'Puerto Varas, Chile', distance: 200 },
      ];

      const cargoTypes = ['caja', 'pallet', 'granel', 'contenedor', 'otro'];
      const statuses = ['pendiente', 'confirmado', 'recogido', 'en_transito', 'entregado', 'rechazado'];

      for (let i = existingShipments; i < existingShipments + 15; i++) {
        const route = routes[i % routes.length];
        const cargoType = cargoTypes[i % cargoTypes.length];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const weightKg = Math.floor(Math.random() * 2000) + 100;
        const price = 5000 + (weightKg * 0.05) + (route.distance * 0.10);
        
        const shipment = await prisma.shipment.create({
          data: {
            tenantId: tenant.id,
            customerId: customers[i % customers.length].id,
            driverId: (status !== 'pendiente' && status !== 'rechazado' && drivers.length > 0) ? drivers[i % drivers.length].id : null,
            origin: route.origin,
            destination: route.destination,
            cargoType,
            cargoWeightKg: weightKg,
            status,
            cargoDescription: `Envío de ${cargoType} - Cliente ${(i % customers.length) + 1}`,
            scheduledPickup: new Date(Date.now() + i * 3600000),
            scheduledDelivery: new Date(Date.now() + (i + 1) * 86400000),
            totalAmount: price,
            createdAt: new Date(Date.now() - i * 3600000),
            updatedAt: new Date(Date.now() - i * 1800000),
          }
        });
        shipments.push(shipment);

        // Crear factura para envíos confirmados o posteriores
        if (status !== 'pendiente' && status !== 'rechazado') {
          await prisma.invoice.create({
            data: {
              tenantId: tenant.id,
              customerId: customers[i % customers.length].id,
              number: `FAC-2024-${1000 + i}`,
              total: price,
              status: status === 'entregado' ? 'emitida' : 'borrador',
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            }
          });

          // Crear pago para algunas facturas
          if (Math.random() > 0.5) {
            await prisma.payment.create({
              data: {
                tenantId: tenant.id,
                customerId: customers[i % customers.length].id,
                invoiceId: shipment.id,
                amount: price * 0.5,
                status: Math.random() > 0.3 ? 'pagado' : 'pendiente',
              }
            });
          }
        }
      }
    }
    console.log(`✅ ${shipments.length} envíos creados con facturas y pagos`);
    }

    // Crear alertas de mantenimiento
    console.log('\n⚠️  Creando alertas de mantenimiento...');
    for (let i = 0; i < 3; i++) {
      await prisma.alert.create({
        data: {
          tenantId: tenant.id,
          type: 'mantenimiento',
          message: `Mantenimiento programado para vehículo ABC${100 + i + 1}`,
          vehicleId: drivers[i]?.id ? await prisma.vehicle.findFirst({ where: { driverId: drivers[i].id } }).then(v => v?.id) : null,
          resolved: false,
          createdAt: new Date(Date.now() - i * 86400000),
        }
      });
    }
    console.log('✅ Alertas creadas');

    console.log('\n🎉 Sistema completo de pedidos creado exitosamente!\n');
    
    console.log('📋 Accesos disponibles:');
    console.log('');
    console.log('🔹 Administrador:');
    console.log('   Email: admin@demo.com');
    console.log('   Password: Admin123!');
    console.log('   URL: http://localhost:5173/admin');
    console.log('');
    console.log('🔹 Clientes:');
    for (let i = 1; i <= 8; i++) {
      console.log(`   Cliente ${i}: cliente${i}@demo.com / Cliente123!`);
    }
    console.log('   URL: http://localhost:5173/cliente');
    console.log('');
    console.log('🔹 Conductores:');
    for (let i = 1; i <= 5; i++) {
      console.log(`   Conductor ${i}: conductor${i}@demo.com / Conductor123!`);
    }
    console.log('   URL: http://localhost:5173/conductor');
    console.log('');
    
    console.log('📊 Estadísticas del sistema:');
    console.log(`   🏢 Tenant: 1`);
    console.log(`   👥 Clientes: ${await prisma.customer.count({ where: { tenantId: tenant.id } })}`);
    console.log(`   🚛 Conductores: ${await prisma.driver.count({ where: { tenantId: tenant.id } })}`);
    console.log(`   🚗 Vehículos: ${await prisma.vehicle.count({ where: { tenantId: tenant.id } })}`);
    console.log(`   📦 Envíos: ${await prisma.shipment.count({ where: { tenantId: tenant.id } })}`);
    console.log(`   🧾 Facturas: ${await prisma.invoice.count({ where: { tenantId: tenant.id } })}`);
    console.log(`   💰 Pagos: ${await prisma.payment.count({ where: { tenantId: tenant.id } })}`);
    console.log(`   ⚠️  Alertas: ${await prisma.alert.count({ where: { tenantId: tenant.id } })}`);
    console.log('');
    
    console.log('🌐 Para probar el flujo completo:');
    console.log('1. 📱 Inicia sesión como admin@demo.com');
    console.log('2. 📊 Verás dashboard con KPIs y todos los datos');
    console.log('3. 📦 Prueba crear nuevos envíos');
    console.log('4. 👥 Prueba asignar conductores a envíos');
    console.log('5. 🚛 Inicia sesión como conductor para ver sus rutas');
    console.log('6. 📦 Inicia sesión como cliente para ver sus envíos');
    console.log('7. 💰 Prueba actualizar estados de envíos');
    console.log('8. 🧾 Prueba generar facturas y pagos');

  } catch (error) {
    console.error('❌ Error al crear sistema de pedidos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
if (require.main === module) {
  createCompleteOrdersSystem()
    .then(() => {
      console.log('\n✨ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falló la ejecución:', error);
      process.exit(1);
    });
}

module.exports = { createCompleteOrdersSystem };
