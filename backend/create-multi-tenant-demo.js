#!/usr/bin/env node

/**
 * Script para demostrar cómo funcionaría el sistema multi-tenant
 * para múltiples empresas de transporte
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createMultiTenantDemo() {
  console.log('🏢 Creando demo de sistema multi-tenant para múltiples empresas...\n');

  try {
    // Empresas de transporte de ejemplo
    const companies = [
      {
        name: 'Transporte Rápido Ltda.',
        slug: 'transporte-rapido',
        legalName: 'Transporte Rápido Limitada',
        taxId: '76.123.456-1',
        address: 'Av. Principal 123, Santiago',
        phone: '+56 2 2345 6789',
        adminEmail: 'admin@transporterapido.cl',
        adminPassword: 'AdminRapido123!',
      },
      {
        name: 'Logística Sur SpA',
        slug: 'logistica-sur',
        legalName: 'Logística Sur SpA',
        taxId: '76.987.654-2',
        address: 'Calle Sur 456, Concepción',
        phone: '+56 41 234 5678',
        adminEmail: 'admin@logisticasur.cl',
        adminPassword: 'AdminSur123!',
      },
      {
        name: 'Carga Express SA',
        slug: 'carga-express',
        legalName: 'Carga Express Sociedad Anónima',
        taxId: '76.555.777-3',
        address: 'Ruta Express 789, Valparaíso',
        phone: '+56 32 345 6789',
        adminEmail: 'admin@cargaexpress.cl',
        adminPassword: 'AdminExpress123!',
      }
    ];

    console.log('📋 Creando 3 empresas de transporte con sus administradores...\n');

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      
      console.log(`🏢 Creando empresa: ${company.name}`);
      
      // 1. Crear Tenant
      const tenant = await prisma.tenant.create({
        data: {
          name: company.name,
          slug: company.slug,
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

      // 2. Crear Company
      const companyRecord = await prisma.company.create({
        data: {
          tenantId: tenant.id,
          legalName: company.legalName,
          taxId: company.taxId,
          address: company.address,
          phone: company.phone,
          pricingBaseFee: 5000,
          pricingPerKg: 0.05,
          pricingPerM3: 0.10,
          pricingMinimumCharge: 10000,
          driverCommissionPercent: 40,
        }
      });

      // 3. Crear usuario Admin
      const hashedPassword = await bcrypt.hash(company.adminPassword, 10);
      const adminUser = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: company.adminEmail,
          passwordHash: hashedPassword,
          role: 'admin',
        }
      });

      // 4. Crear algunos conductores para cada empresa
      const drivers = [
        {
          fullName: `Conductor 1 - ${company.name}`,
          taxId: `${10 + i * 100}.111.222-${i + 1}`,
          phone: `+56 9 111${i}222${i}`,
          licenseNumber: `CH${1000 + i * 100}`,
        },
        {
          fullName: `Conductor 2 - ${company.name}`,
          taxId: `${10 + i * 100}.333.444-${i + 1}`,
          phone: `+56 9 333${i}444${i}`,
          licenseNumber: `CH${2000 + i * 100}`,
        }
      ];

      for (const driverData of drivers) {
        const driver = await prisma.driver.create({
          data: {
            tenantId: tenant.id,
            ...driverData,
            status: 'activo',
            licenseExpiry: new Date('2025-12-31'),
          }
        });

        // Crear usuario para el conductor
        const driverEmail = `conductor${driverData.licenseNumber}@${company.slug}.cl`;
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

        // Crear vehículo para el conductor
        await prisma.vehicle.create({
          data: {
            tenantId: tenant.id,
            plate: `${company.slug.toUpperCase().substring(0, 3)}${100 + i * 10 + drivers.indexOf(driverData)}`,
            make: 'Toyota',
            model: 'Hilux',
            year: 2024,
            status: 'disponible',
            capacityKg: 3000,
            driverId: driver.id,
          }
        });
      }

      // 5. Crear clientes para cada empresa
      const customers = [
        {
          name: `Cliente A - ${company.name}`,
          taxId: `${20 + i * 100}.777.888-${i + 1}`,
          email: `cliente.a@${company.slug}.cl`,
          phone: `+56 2 777${i}888${i}`,
        },
        {
          name: `Cliente B - ${company.name}`,
          taxId: `${20 + i * 100}.999.000-${i + 1}`,
          email: `cliente.b@${company.slug}.cl`,
          phone: `+56 2 999${i}000${i}`,
        }
      ];

      for (const customerData of customers) {
        const customer = await prisma.customer.create({
          data: {
            tenantId: tenant.id,
            ...customerData,
            address: `Dirección Cliente ${customers.indexOf(customerData) + 1}`,
          }
        });

        // Crear usuario para el cliente
        const customerPassword = await bcrypt.hash('Cliente123!', 10);
        await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email: customerData.email,
            passwordHash: customerPassword,
            role: 'cliente',
            customerId: customer.id,
          }
        });
      }

      console.log(`✅ Empresa ${company.name} creada exitosamente`);
      console.log(`   🔹 Admin: ${company.adminEmail} / ${company.adminPassword}`);
      console.log(`   🔹 Slug: ${company.slug}`);
      console.log(`   🔹 Conductores: ${drivers.length}`);
      console.log(`   🔹 Clientes: ${customers.length}\n`);
    }

    console.log('🎉 Demo multi-tenant creada exitosamente!\n');
    
    console.log('📋 Resumen de acceso por empresa:');
    console.log('');
    
    for (const company of companies) {
      console.log(`🏢 ${company.name}`);
      console.log(`   🔹 URL: http://localhost:5173/login?tenant=${company.slug}`);
      console.log(`   🔹 Admin: ${company.adminEmail} / ${company.adminPassword}`);
      console.log(`   🔹 Conductores: conductor1@${company.slug}.cl / Conductor123!`);
      console.log(`   🔹             conductor2@${company.slug}.cl / Conductor123!`);
      console.log(`   🔹 Clientes: cliente.a@${company.slug}.cl / Cliente123!`);
      console.log(`   🔹           cliente.b@${company.slug}.cl / Cliente123!`);
      console.log('');
    }

    console.log('🌐 Para probar el aislamiento de datos:');
    console.log('1. Inicia sesión como admin de una empresa');
    console.log('2. Verás solo los datos de esa empresa');
    console.log('3. Cambia a otra empresa y verás datos completamente diferentes');
    console.log('4. Los usuarios no pueden ver datos de otras empresas');

  } catch (error) {
    console.error('❌ Error al crear demo multi-tenant:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
if (require.main === module) {
  createMultiTenantDemo()
    .then(() => {
      console.log('\n✨ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falló la ejecución:', error);
      process.exit(1);
    });
}

module.exports = { createMultiTenantDemo };
