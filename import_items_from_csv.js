// import_items_from_csv.js
// One-time script to push grocery_items_100.csv into MySQL (categories + items)

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('./db'); // uses your existing connection :contentReference[oaicite:0]{index=0}

// 👉 Change this if your admin user_id is different
const ADMIN_USER_ID = 1;

// Path to CSV
const CSV_FILE = 'medical_store_items_200_with_variants.csv';


// Cache to avoid repeating category queries
const categoryCache = new Map();

function getCategoryId(categoryName) {
  return new Promise((resolve, reject) => {
    if (!categoryName) {
      return resolve(null);
    }

    const key = categoryName.trim();

    // If we already saw this category, return cached id
    if (categoryCache.has(key)) {
      return resolve(categoryCache.get(key));
    }

    // 1) Check if category already exists
    db.query(
      'SELECT category_id FROM categories WHERE name = ?',
      [key],
      (err, rows) => {
        if (err) return reject(err);

        if (rows.length > 0) {
          const id = rows[0].category_id;
          categoryCache.set(key, id);
          return resolve(id);
        }

        // 2) If not, insert new category
        const cat = { name: key, description: null };
        db.query('INSERT INTO categories SET ?', cat, (err2, res2) => {
          if (err2) return reject(err2);
          const newId = res2.insertId;
          categoryCache.set(key, newId);
          return resolve(newId);
        });
      }
    );
  });
}

function insertItem(row, categoryId) {
  return new Promise((resolve, reject) => {
    const name = (row.name || '').trim();
    if (!name) {
      console.log('⏭️  Skipping row without name:', row);
      return resolve();
    }

    const quantity = Number(row.quantity || 0);
    const cost = Number(row.cost || 0);
    const minThreshold = Number(row.min_threshold || 0);
    const supplier = row.supplier ? row.supplier.trim() : null;

    let expDate = null;
    if (row.expiration_date && row.expiration_date.trim() !== '') {
      const d = new Date(row.expiration_date);
      if (!isNaN(d.getTime())) {
        expDate = d;
      }
    }

    const item = {
      name,
      category_id: categoryId,
      quantity,
      cost,
      supplier,
      expiration_date: expDate,
      min_threshold: minThreshold,
      user_id: ADMIN_USER_ID,   // who created this seed item
      image_url: null           // admin can add images later from UI
    };

    db.query('INSERT INTO items SET ?', item, (err, result) => {
      if (err) return reject(err);
      console.log(`✅ Inserted item: ${name} (id=${result.insertId})`);
      resolve();
    });
  });
}

async function importCsv() {
  const rows = [];

  console.log('📥 Reading CSV:', CSV_FILE);

  // 1) Read all rows from CSV into memory
  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Found ${rows.length} row(s) in CSV.`);

  // 2) Process rows sequentially
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const catName = row.category ? row.category.trim() : null;
      const categoryId = await getCategoryId(catName);
      await insertItem(row, categoryId);
    } catch (err) {
      console.error(`❌ Error on row ${i + 1} (${row.name || 'no name'}):`, err.message);
    }
  }

  console.log('🎉 Import finished.');
  db.end();
}

// Run the import
importCsv().catch((err) => {
  console.error('Fatal import error:', err);
  db.end();
});
