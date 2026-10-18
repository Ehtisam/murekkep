// Sublime paketi Packages klasörüne bu klasörün bağlantısı (junction) olarak kurulur.
// Bağlantının gerçek yerini bulup Garantech'teki mrk.js'i çalıştırır; böylece parser'ın
// tek bir kopyası olur ve güncellemeler pakete kendiliğinden yansır.
const fs = require('fs');
const path = require('path');

const gercekYer = fs.realpathSync(__dirname);
require(path.join(gercekYer, '..', '..', '..', 'mrk.js'));
