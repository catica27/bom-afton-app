<#
Migracion BOM Afton nuevos Aditivos 2026.xlsx -> data/seed.json
Usa Excel COM (no hay Node/Python en esta maquina). Lee Fms (motor real de formulas)
y Principal (parametros: costos MP, indirectos, empaque, margenes) y cruza por codigo.
#>
param(
    [string]$ExcelPath = "C:\Users\tanya\OneDrive\Desktop\BOM Afton nuevos Aditivos 2026.xlsx",
    [string]$OutPath = "C:\Users\tanya\Claude\bom-afton-app\data\seed.json"
)

$ErrorActionPreference = "Stop"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($ExcelPath, [Type]::Missing, $true)
$fms = $wb.Worksheets.Item("Fms")
$prin = $wb.Worksheets.Item("Principal")

function CellText($ws, $r, $c) { return $ws.Cells.Item($r, $c).Text }
function CellVal($ws, $r, $c) { return $ws.Cells.Item($r, $c).Value2 }
function CellFormula($ws, $r, $c) { return $ws.Cells.Item($r, $c).Formula }

# ---------- 1. Materias primas ----------
$rawMaterials = @()
$idc = 1
$baseOilRows = 127..130
foreach ($r in $baseOilRows) {
    $name = CellText $prin $r 2
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $cost = CellVal $prin $r 4
    $rawMaterials += [ordered]@{
        id = "mp-$idc"; nombre = $name.Trim(); categoria = "aceite_base"
        unidadCompra = "L"; costoUnitario = [math]::Round($cost,4)
        origen = $null; fechaActualizacion = "2026-07-22"; notas = $null
    }
    $idc++
}
$additiveRows = 158..174
foreach ($r in $additiveRows) {
    $name = CellText $prin $r 2
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $cost = CellVal $prin $r 6
    $dens = CellVal $prin $r 7
    $rawMaterials += [ordered]@{
        id = "mp-$idc"; nombre = $name.Trim(); categoria = "aditivo"
        unidadCompra = "kg"; costoUnitario = [math]::Round($cost,4)
        densidad = $dens; origen = "importado"; fechaActualizacion = "2026-07-22"; notas = $null
    }
    $idc++
}
# DYE aparece usado en formulas (Fms fila 26) pero sin costo unitario en Principal -> gap conocido
$rawMaterials += [ordered]@{
    id = "mp-$idc"; nombre = "DYE"; categoria = "aditivo"
    unidadCompra = "kg"; costoUnitario = 0
    origen = $null; fechaActualizacion = $null
    notas = "Sin costo unitario definido en el Excel original (gap de datos) - revisar con compras."
}
$rawMaterialByName = @{}
foreach ($m in $rawMaterials) { $rawMaterialByName[$m.nombre.ToUpper()] = $m }

# ---------- 2. Presentaciones ----------
$presentations = @(
    [ordered]@{ id = "pres-cuarto";  nombre = "Cuarto";  volumenL = 0.946 }
    [ordered]@{ id = "pres-galon";   nombre = "Galón";   volumenL = 3.785 }
    [ordered]@{ id = "pres-cubeta";  nombre = "Cubeta";  volumenL = 18.927 }
    [ordered]@{ id = "pres-estanon"; nombre = "Estañón"; volumenL = 208.17 }
    [ordered]@{ id = "pres-tote";    nombre = "Tote";    volumenL = 1000 }
)

# ---------- 3. Costos indirectos (Principal filas 38-42, D=tarifa $/L, E:H = Cuarto/Galon/Cubeta/Estanon) ----------
$indirectRowsMap = @{ 38 = "Consumo Energía"; 39 = "Agua"; 40 = "Alquiler"; 41 = "Depreciación"; 42 = "Mano de obra" }
$indirectCosts = @()
foreach ($r in $indirectRowsMap.Keys | Sort-Object) {
    $rate = CellVal $prin $r 4
    $indirectCosts += [ordered]@{ id = "ind-$r"; nombre = $indirectRowsMap[$r]; tarifaPorLitro = [math]::Round($rate,6) }
}
# Nota: no hay tarifa definida para "Tote" en el Excel original (rango D38:D42 aplica a Cuarto/Galon/Cubeta/Estañon unicamente)

# ---------- 4. Empaque (Principal filas 68-84). Total ya calculado por presentacion en columna F ----------
$pkgUnit = @{
    "Estañón" = @{ envase = (CellVal $prin 68 4); total = (CellVal $prin 68 6) }
    "Cubeta"  = @{ envase = (CellVal $prin 69 4); total = (CellVal $prin 69 6) }
    "Galón"   = @{ envase = (CellVal $prin 70 4); total = (CellVal $prin 70 6) }
    "Cuarto"  = @{ envase = (CellVal $prin 71 4); total = (CellVal $prin 71 6) }
    "Tote"    = @{ envase = (CellVal $prin 72 4); total = (CellVal $prin 72 6) }
}
$packaging = @{}
foreach ($k in $pkgUnit.Keys) {
    $envase = $pkgUnit[$k].envase
    $total = $pkgUnit[$k].total
    $otros = [math]::Round($total - $envase, 4)
    $packaging[$k] = @(
        [ordered]@{ concepto = "Envase"; costo = [math]::Round($envase,4) }
        [ordered]@{ concepto = "Cajas / tarima / cinta / etiquetas / protección (prorrateado)"; costo = $otros }
    )
}

# ---------- 5. Margenes ----------
$marginRules = @(
    [ordered]@{ id = "margin-local"; criterio = "origenAceiteBase"; valor = "BO local"; factor = (CellVal $prin 135 5) }
    [ordered]@{ id = "margin-imp"; criterio = "origenAceiteBase"; valor = "BO imp"; factor = (CellVal $prin 136 5) }
)

# ---------- 6. Fms: formulas por producto base x presentacion ----------
$familyAnchors = @(
    @{ row = 2; col = 20; name = "Passenger Car Motor Oil" }
    @{ row = 2; col = 38; name = "Truck Hydraulic Fluid" }
    @{ row = 31; col = 20; name = "Motorcycle Oil" }
    @{ row = 31; col = 38; name = "Transmision Oil" }
    @{ row = 61; col = 20; name = "Heavy Duty Engines Oil" }
    @{ row = 91; col = 20; name = "Hydraulic Oil" }
    @{ row = 121; col = 20; name = "Automatic Transmision Oil" }
    @{ row = 151; col = 20; name = "Gear Oil" }
)

$fmsCols = 3..96  # C:CR
$lastBaseName = ""
$fmsEntries = @()
foreach ($c in $fmsCols) {
    $baseNameCell = CellText $fms 3 $c
    if (-not [string]::IsNullOrWhiteSpace($baseNameCell)) { $lastBaseName = $baseNameCell.Trim() }
    $codigo = CellText $fms 4 $c
    if ([string]::IsNullOrWhiteSpace($codigo)) { continue }
    $codigoVal = CellVal $fms 4 $c
    $volumen = CellVal $fms 28 $c
    $densidad = CellVal $fms 32 $c
    $presLabel = CellText $fms 31 $c
    $costoMP = CellVal $fms 63 $c
    $costoTotal = CellVal $fms 66 $c

    $ingredientes = @()
    for ($r = 5; $r -le 26; $r++) {
        $pct = CellVal $fms $r $c
        if ($pct -ne $null -and $pct -ne 0 -and $pct -ne "") {
            $matName = (CellText $fms $r 1).Trim()
            $ingredientes += [ordered]@{ materiaPrima = $matName; porcentaje = [math]::Round([double]$pct, 6) }
        }
    }

    $fmsEntries += [ordered]@{
        productoBase = $lastBaseName
        codigo = "$([int64]$codigoVal)"
        presentacionLabel = $presLabel
        volumenL = $volumen
        densidad = $densidad
        ingredientes = $ingredientes
        costoMateriaPrimaVerif = $costoMP
        costoTotalVerif = $costoTotal
    }
}

# ---------- 7. Principal: escanear celdas HLOOKUP para nombre/origen/familia/precio por codigo ----------
$prinEntries = @{}
$usedRange = $prin.UsedRange
$maxRow = $usedRange.Row + $usedRange.Rows.Count - 1
$maxCol = $usedRange.Column + $usedRange.Columns.Count - 1
for ($r = 1; $r -le [Math]::Min($maxRow, 300); $r++) {
    for ($c = 1; $c -le $maxCol; $c++) {
        $f = CellFormula $prin $r $c
        if ($f -and $f.StartsWith("=+HLOOKUP(")) {
            $codigoVal = CellVal $prin $r ($c - 1)
            if (-not $codigoVal) { continue }
            $codigo = "$([int64]$codigoVal)"
            $nombre = (CellText $prin $r ($c - 5)).Trim()
            $origen = (CellText $prin $r ($c - 6)).Trim()
            $precio = CellVal $prin $r ($c + 1)

            # familia: el titulo de bloque esta siempre arriba-izquierda de su tabla de datos.
            # candidatos validos = anchors con row<=r Y col<=c; entre esos, el mas cercano (mayor row, luego mayor col)
            $best = $null
            foreach ($a in $familyAnchors) {
                if ($a.row -le $r -and $a.col -le $c) {
                    if ($best -eq $null -or $a.row -gt $best.row -or ($a.row -eq $best.row -and $a.col -gt $best.col)) {
                        $best = $a
                    }
                }
            }
            $familia = if ($best) { $best.name } else { "Sin clasificar" }

            $prinEntries[$codigo] = [ordered]@{
                nombreCompleto = $nombre
                origen = $origen
                familia = $familia
                precioVerif = $precio
            }
        }
    }
}

# ---------- 8. Cruzar Fms x Principal, agrupar por productoBase ----------
$productsByBase = [ordered]@{}
foreach ($e in $fmsEntries) {
    $pinfo = $prinEntries[$e.codigo]
    if (-not $productsByBase.Contains($e.productoBase)) {
        $productsByBase[$e.productoBase] = [ordered]@{
            id = "prod-" + ($e.productoBase -replace '[^a-zA-Z0-9]', '-').ToLower()
            nombre = $e.productoBase
            familia = if ($pinfo) { $pinfo.familia } else { "Sin clasificar" }
            origenAceiteBase = if ($pinfo) { $pinfo.origen } else { $null }
            densidadKgL = $e.densidad
            ingredientes = $e.ingredientes
            estado = "activo"
            presentaciones = @()
        }
    }
    $entry = $productsByBase[$e.productoBase]
    $entry.presentaciones += [ordered]@{
        presentacion = $e.presentacionLabel
        codigo = $e.codigo
        volumenL = $e.volumenL
        nombreCompleto = if ($pinfo) { $pinfo.nombreCompleto } else { $null }
        verificacionExcel = [ordered]@{
            costoMateriaPrima = [math]::Round($e.costoMateriaPrimaVerif, 4)
            costoTotal = [math]::Round($e.costoTotalVerif, 4)
            precio = if ($pinfo) { [math]::Round($pinfo.precioVerif, 4) } else { $null }
        }
    }
}

$seed = [ordered]@{
    generadoDesde = "BOM Afton nuevos Aditivos 2026.xlsx"
    fechaMigracion = (Get-Date -Format "yyyy-MM-dd")
    versionExcelOrigen = 18
    rawMaterials = $rawMaterials
    presentations = $presentations
    indirectCosts = $indirectCosts
    packaging = $packaging
    marginRules = $marginRules
    products = @($productsByBase.Values)
}

New-Item -ItemType Directory -Force -Path (Split-Path $OutPath) | Out-Null
$json = $seed | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($OutPath, $json)

# data/seed.js: mismo contenido envuelto como script clasico (window.SEED_DATA = {...}),
# para que la app cargue el seed sin fetch() y funcione abriendo index.html directamente.
$seedJsPath = Join-Path (Split-Path $OutPath) "seed.js"
[System.IO.File]::WriteAllText($seedJsPath, "window.SEED_DATA = " + $json + ";`n")

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "OK products=$($productsByBase.Count) rawMaterials=$($rawMaterials.Count) wrote=$OutPath"
