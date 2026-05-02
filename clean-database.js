// Limpiar base de datos eliminando todos los choferes y empresas
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

async function cleanDatabase() {
  console.log('🧹 LIMPIANDO BASE DE DATOS - ELIMINANDO CHOFERES Y EMPRESAS\n');

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

  // 2. Eliminar todos los conductores
  console.log('\n🗑️ ELIMINANDO TODOS LOS CONDUCTORES:');
  
  try {
    const driversResponse = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (driversResponse.statusCode === 200) {
      const driversData = JSON.parse(driversResponse.body);
      const drivers = driversData.data || [];
      
      console.log(`   Conductores encontrados: ${drivers.length}`);
      
      for (const driver of drivers) {
        try {
          const deleteResponse = await makeRequest(`/api/v1/drivers/${driver.id}`, 'DELETE', null, {
            'Authorization': `Bearer ${adminToken}`
          });
          
          if (deleteResponse.statusCode === 200 || deleteResponse.statusCode === 204) {
            console.log(`   ✅ Eliminado: ${driver.fullName} (${driver.id})`);
          } else {
            console.log(`   ❌ Error eliminando ${driver.fullName}: ${deleteResponse.statusCode}`);
          }
        } catch (error) {
          console.log(`   ❌ Error eliminando ${driver.fullName}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo conductores:', error.message);
  }

  // 3. Eliminar todas las empresas
  console.log('\n🗑️ ELIMINANDO TODAS LAS EMPRESAS:');
  
  try {
    const companiesResponse = await makeRequest('/api/v1/customers', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (companiesResponse.statusCode === 200) {
      const companiesData = JSON.parse(companiesResponse.body);
      const companies = companiesData.data || [];
      
      console.log(`   Empresas encontradas: ${companies.length}`);
      
      for (const company of companies) {
        try {
          const deleteResponse = await makeRequest(`/api/v1/customers/${company.id}`, 'DELETE', null, {
            'Authorization': `Bearer ${adminToken}`
          });
          
          if (deleteResponse.statusCode === 200 || deleteResponse.statusCode === 204) {
            console.log(`   ✅ Eliminada: ${company.name} (${company.id})`);
          } else {
            console.log(`   ❌ Error eliminando ${company.name}: ${deleteResponse.statusCode}`);
          }
        } catch (error) {
          console.log(`   ❌ Error eliminando ${company.name}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo empresas:', error.message);
  }

  // 4. Eliminar todos los envíos
  console.log('\n🗑️ ELIMINANDO TODOS LOS ENVÍOS:');
  
  try {
    const shipmentsResponse = await makeRequest('/api/v1/shipments', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (shipmentsResponse.statusCode === 200) {
      const shipmentsData = JSON.parse(shipmentsResponse.body);
      const shipments = shipmentsData.data || [];
      
      console.log(`   Envíos encontrados: ${shipments.length}`);
      
      for (const shipment of shipments) {
        try {
          const deleteResponse = await makeRequest(`/api/v1/shipments/${shipment.id}`, 'DELETE', null, {
            'Authorization': `Bearer ${adminToken}`
          });
          
          if (deleteResponse.statusCode === 200 || deleteResponse.statusCode === 204) {
            console.log(`   ✅ Eliminado: Envío ${shipment.id?.substring(-6).toUpperCase()}`);
          } else {
            console.log(`   ❌ Error eliminando envío ${shipment.id}: ${deleteResponse.statusCode}`);
          }
        } catch (error) {
          console.log(`   ❌ Error eliminando envío ${shipment.id}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo envíos:', error.message);
  }

  console.log('\n✅ LIMPIEZA COMPLETADA');
  console.log('📊 Base de datos limpia, lista para crear las 3 cuentas principales');
}

cleanDatabase();
