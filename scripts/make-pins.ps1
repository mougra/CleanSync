# Генерация вертикальных пинов 1000×1500 из обложек статей.
#
# Зачем: Pinterest работает на 2:3, а обложки статей — 1200×630 (горизонталь).
# Скрипт берёт кадр из обложки, кладёт его в верхнюю часть пина и добавляет
# текстовый блок в фирменном зелёном: категория, минуты, короткий заголовок,
# иконка статьи (та же, что в плашке обложки) и подпись бренда.
#
# Запуск: pwsh -File scripts/make-pins.ps1
# Результат: docs/pins/ru/<slug>.jpg и docs/pins/en/<slug>.jpg

param(
    # Корень репозитория: по умолчанию — каталогом выше самого скрипта.
    [string]$Root = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path,
    # Один слаг — чтобы проверить вёрстку, не собирая все 48 пинов.
    [string]$Slug = ''
)

# Размеры в скрипте — пиксели, а не пункты: Font по умолчанию считает в пунктах,
# и 72pt превратились бы в 96px, поехав по всем отступам.
function New-Font($family, [int]$size, $style) {
    # Именно ::new(), а не New-Object Type(...): внутри списка аргументов
    # New-Object PowerShell разбирает `[single]$size` как строку, и перегрузка
    # конструктора не находится.
    return [System.Drawing.Font]::new($family, [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Regular = [System.Drawing.FontStyle]::Regular
$BoldStyle = [System.Drawing.FontStyle]::Bold

$W = 1000
$H = 1500
$PhotoH = 780

# ── Палитра из web/app/assets/css/tokens.css ──────────────────────────────
function Hex([string]$hex, [int]$alpha = 255) {
    $hex = $hex.TrimStart('#')
    $r = [Convert]::ToInt32($hex.Substring(0, 2), 16)
    $g = [Convert]::ToInt32($hex.Substring(2, 2), 16)
    $b = [Convert]::ToInt32($hex.Substring(4, 2), 16)
    return [System.Drawing.Color]::FromArgb($alpha, $r, $g, $b)
}

$Brand      = Hex '#2a584d'   # --c-brand
$BrandSoft  = Hex '#d5e0d0'   # --c-brand-soft
$Cream      = Hex '#fef9f6'   # --c-bg
$Amber      = Hex '#c8893f'   # --c-amber
$White      = [System.Drawing.Color]::White

# ── Шрифты ────────────────────────────────────────────────────────────────
# Onest — тот же шрифт, что в интерфейсе, но взять его из Google Fonts прямо
# нельзя: браузеру отдают woff2, а GDI+ понимает только TTF. Для старого
# User-Agent Google отдаёт EOT (это TTF с заголовком) — вырезаем из него sfnt.
function Ensure-Font([string]$path, [int]$weight) {
    if (Test-Path $path) { return }

    New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
    $ua = 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)'
    $css = (Invoke-WebRequest -UseBasicParsing -UserAgent $ua -TimeoutSec 30 `
            -Uri "https://fonts.googleapis.com/css2?family=Onest:wght@$weight").Content
    $url = [regex]::Match($css, 'url\((https://[^\)]+)\)').Groups[1].Value
    if (-not $url) { throw "не удалось найти файл шрифта Onest $weight" }

    $tmp = "$path.eot"
    Invoke-WebRequest -UseBasicParsing -UserAgent $ua -TimeoutSec 60 -Uri $url -OutFile $tmp
    $bytes = [System.IO.File]::ReadAllBytes($tmp)

    # sfnt начинается с 00 01 00 00; всё до этого — заголовок EOT.
    $offset = -1
    for ($i = 0; $i -lt $bytes.Length - 3; $i++) {
        if ($bytes[$i] -eq 0 -and $bytes[$i + 1] -eq 1 -and $bytes[$i + 2] -eq 0 -and $bytes[$i + 3] -eq 0) {
            $offset = $i
            break
        }
    }
    if ($offset -le 0) { throw "в файле Onest $weight не нашёлся sfnt" }

    [System.IO.File]::WriteAllBytes($path, $bytes[$offset..($bytes.Length - 1)])
    Remove-Item $tmp -Force
}

$fontDir = Join-Path $Root '.local/fonts'
Ensure-Font (Join-Path $fontDir 'onest-400.ttf') 400
Ensure-Font (Join-Path $fontDir 'onest-700.ttf') 700

# Имена коллекций не должны совпадать с переменными стилей ($Regular/$BoldStyle):
# PowerShell не различает регистр, и `$regular` затирал бы `$Regular`.
$regularFonts = New-Object System.Drawing.Text.PrivateFontCollection
$boldFonts    = New-Object System.Drawing.Text.PrivateFontCollection
$iconFonts    = New-Object System.Drawing.Text.PrivateFontCollection

$regularFonts.AddFontFile((Join-Path $fontDir 'onest-400.ttf'))
$boldFonts.AddFontFile((Join-Path $fontDir 'onest-700.ttf'))
$iconFonts.AddFontFile((Join-Path $Root 'web/node_modules/primeicons/fonts/primeicons.ttf'))

$regularFamily = $regularFonts.Families[0]
$boldFamily    = $boldFonts.Families[0]
$iconFamily    = $iconFonts.Families[0]

# ── Локализация подписей и категорий ──────────────────────────────────────
# Русские подписи лежат отдельным JSON и читаются с явной кодировкой: так скрипт
# не зависит от того, сохранён ли он с BOM (Windows PowerShell 5.1 читает файл
# без BOM как ANSI и превращает кириллицу в мусор ещё на разборе).
$labelsPath = Join-Path $Root 'scripts/pins-labels.json'
$labels = [System.IO.File]::ReadAllText($labelsPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

# ── Front-matter ──────────────────────────────────────────────────────────
function Get-FrontMatter([string]$path) {
    $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $data = @{}
    foreach ($line in ($text -split "`n")) {
        if ($line -match '^(\w+):\s*(.*)$') {
            $key = $Matches[1]
            $value = $Matches[2].Trim()
            if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $Matches[1] }
            if (-not $data.ContainsKey($key)) { $data[$key] = $value }
        }
        elseif ($line -match '^---\s*$' -and $data.Count -gt 0) { break }
    }
    return $data
}

# ── Переносы строк ────────────────────────────────────────────────────────
$sf = [System.Drawing.StringFormat]::GenericTypographic
$sf.FormatFlags = [System.Drawing.StringFormatFlags]($sf.FormatFlags -bor [System.Drawing.StringFormatFlags]::NoWrap)

function Measure-TextWidth([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font) {
    return $g.MeasureString($text, $font, 10000, $sf).Width
}

function Wrap-Text([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [int]$maxWidth) {
    $words = $text -split '\s+'
    $lines = New-Object System.Collections.Generic.List[string]
    $current = ''
    foreach ($word in $words) {
        $candidate = if ($current) { "$current $word" } else { $word }
        if ((Measure-TextWidth $g $candidate $font) -le $maxWidth -or -not $current) {
            $current = $candidate
        }
        else {
            $lines.Add($current)
            $current = $word
        }
    }
    if ($current) { $lines.Add($current) }
    return $lines
}

# Балансировка строк: динамическое программирование по числу строк, а не
# «самая узкая ширина». Жадный перенос даёт короткую первую строку и дыру слева
# («Окна без» / «разводов: порядок,» / «который решает»), DP раскладывает слова
# так, чтобы строки были примерно равны при том же их числе.
function Wrap-Balanced([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [int]$maxWidth) {
    $words = @($text -split '\s+' | Where-Object { $_ })
    $n = $words.Count
    if ($n -le 1) { return (Wrap-Text $g $text $font $maxWidth) }

    $greedy = Wrap-Text $g $text $font $maxWidth
    $k = $greedy.Count

    $w = New-Object 'double[,]' $n, $n
    for ($i = 0; $i -lt $n; $i++) {
        for ($j = $i; $j -lt $n; $j++) {
            $w[$i, $j] = Measure-TextWidth $g (($words[$i..$j]) -join ' ') $font
        }
    }

    $inf = [double]::PositiveInfinity
    $best = New-Object 'double[,]' ($k + 1), ($n + 1)
    $prev = New-Object 'int[,]' ($k + 1), ($n + 1)
    for ($a = 0; $a -le $k; $a++) {
        for ($b = 0; $b -le $n; $b++) { $best[$a, $b] = $inf }
    }
    $best[0, 0] = 0

    for ($line = 1; $line -le $k; $line++) {
        for ($j = $line; $j -le $n; $j++) {
            for ($i = $line - 1; $i -lt $j; $i++) {
                if ($best[($line - 1), $i] -eq $inf) { continue }
                $wid = $w[$i, ($j - 1)]
                if ($wid -gt $maxWidth) { continue }
                $slack = $maxWidth - $wid
                $cost = $best[($line - 1), $i] + $slack * $slack
                if ($cost -lt $best[$line, $j]) {
                    $best[$line, $j] = $cost
                    $prev[$line, $j] = $i
                }
            }
        }
    }

    if ($best[$k, $n] -eq $inf) { return (Fix-ColonBreaks $g $greedy $font $maxWidth) }

    $lines = New-Object System.Collections.Generic.List[string]
    $end = $n
    for ($line = $k; $line -ge 1; $line--) {
        $start = $prev[$line, $end]
        $lines.Insert(0, (($words[$start..($end - 1)]) -join ' '))
        $end = $start
    }

    return (Fix-ColonBreaks $g $lines $font $maxWidth)
}

# Строка, которая заканчивается двоеточием, читается как обрубленная («постель:»
# в конце строки). Переносим последнее слово такой строки на следующую, а если
# строка состоит из одного слова — приклеиваем его к следующей и убираем пустую.
function Fix-ColonBreaks([System.Drawing.Graphics]$g, $lines, [System.Drawing.Font]$font, [int]$maxWidth) {
    $i = 0
    while ($i -lt $lines.Count - 1) {
        if ($lines[$i].TrimEnd() -notmatch ':$') { $i++; continue }

        $words = @($lines[$i].Trim() -split '\s+')
        $moved = $words[-1]
        $candidate = "$moved " + $lines[$i + 1]

        if ((Measure-TextWidth $g $candidate $font) -gt $maxWidth) { $i++; continue }

        if ($words.Count -ge 2) {
            $lines[$i] = ($words[0..($words.Count - 2)] -join ' ')
            $lines[$i + 1] = $candidate
            $i++
            continue
        }

        # Одно слово: строка исчезает целиком.
        $lines[$i + 1] = $candidate
        $lines.RemoveAt($i)
    }

    return $lines
}

# Короткий заголовок для пина: длинный режем по двоеточию.
function Get-PinTitle([string]$title) {
    $t = $title.Trim()
    if ($t.Length -le 58) { return $t }
    $i = $t.IndexOf(':')
    if ($i -ge 14) { return $t.Substring(0, $i).Trim() }
    return $t
}

# Описание для пина: первое предложение статьи, ужатое до ~170 символов, плюс
# три хештега. Длинные описания Pinterest обрезает сам, а обрыв на середине
# слова выглядит неряшливо.
function Get-PinDescription([string]$title, [string]$description, [string]$lang, [string]$category) {
    $text = if ($description) { $description.Trim() } else { $title.Trim() }

    $dot = $text.IndexOf('. ')
    if ($dot -gt 40) { $text = $text.Substring(0, $dot) }

    if ($text.Length -gt 170) {
        $cut = $text.LastIndexOf(' ', 170)
        if ($cut -lt 100) { $cut = 170 }
        $text = $text.Substring(0, $cut).TrimEnd(',', ';', ' ', [char]0x2014) + '…'
    }

    if ($text -notmatch '[.!?…]$') { $text += '.' }

    if ($lang -eq 'en') {
        return "$text #cleaningtips #$category #tidyplan"
    }

    return "$text #уборка #порядоквдоме #tidyplan"
}

# ── Рисование ─────────────────────────────────────────────────────────────
function New-Pin {
    param(
        [string]$Cover, [string]$Title, [string]$Category, [string]$Minutes,
        [string]$Icon, [string]$Language, [string]$Out
    )

    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $g.Clear($Brand)

    # Фото: заполняем верхнюю полосу, режем по центру (плашка с иконкой на
    # обложке живёт в левом нижнем углу и при таком кадре уходит за край).
    $img = [System.Drawing.Image]::FromFile($Cover)
    try {
        $scale = [Math]::Max($W / $img.Width, $PhotoH / $img.Height)
        $srcW = $W / $scale
        $srcH = $PhotoH / $scale
        $srcX = ($img.Width - $srcW) / 2
        $srcY = ($img.Height - $srcH) * 0.4
        $dest = [System.Drawing.RectangleF]::new([single]0, [single]0, [single]$W, [single]$PhotoH)
        $src = [System.Drawing.RectangleF]::new([single]$srcX, [single]$srcY, [single]$srcW, [single]$srcH)
        $g.DrawImage($img, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
    }
    finally { $img.Dispose() }

    # Тонкая охристая линия на стыке — как разделитель, не как акцент.
    $bar = New-Object System.Drawing.SolidBrush $Amber
    $g.FillRectangle($bar, 0, $PhotoH, $W, 6)
    $bar.Dispose()

    $padX = 72
    $contentW = $W - 2 * $padX

    # Иконка статьи в кремовом круге.
    $circleD = 64
    $circleY = $PhotoH + 46
    $cream = New-Object System.Drawing.SolidBrush $Cream
    $g.FillEllipse($cream, $padX, $circleY, $circleD, $circleD)
    $cream.Dispose()

    $iconBrush = New-Object System.Drawing.SolidBrush $Brand
    # Крупнее 26 px: на 1000 px ширины глиф читался как точка в круге.
    $iconFont = New-Font $iconFamily 34 $Regular
    # Код глифа — одиночный символ BMP; в Windows PowerShell 5.1 нет `u{...},
    # поэтому собираем из числового кода.
    $iconText = [string][char][Convert]::ToInt32($Icon, 16)
    $iconSize = $g.MeasureString($iconText, $iconFont, 10000, $sf)
    $g.DrawString($iconText, $iconFont, $iconBrush, ($padX + ($circleD - $iconSize.Width) / 2), ($circleY + ($circleD - $iconSize.Height) / 2), $sf)
    $iconFont.Dispose()
    $iconBrush.Dispose()

    # Категория · минуты
    $categoryLabel = $labels.$Language.categories.$Category
    $minutesLabel = $labels.$Language.minutes
    $label = if ($Minutes) {
        "$($categoryLabel.ToUpper()) · $Minutes $($minutesLabel.ToUpper())"
    }
    else { $categoryLabel.ToUpper() }

    $labelFont = New-Font $regularFamily 26 $Regular
    $softBrush = New-Object System.Drawing.SolidBrush $BrandSoft
    $labelY = $circleY + ($circleD - $g.MeasureString($label, $labelFont, 10000, $sf).Height) / 2
    $g.DrawString($label, $labelFont, $softBrush, ($padX + $circleD + 24), $labelY, $sf)
    $labelFont.Dispose()

    # Заголовок: самый крупный размер, при котором влезает не больше четырёх строк.
    $titleTop = $PhotoH + 176
    $footerY = $H - 132
    # Свободная высота под заголовок — от его верхней границы до подписи бренда.
    $titleSpace = $footerY - 40 - $titleTop
    # Заголовок приходит уже коротким: обрезку делает вызывающий код, чтобы
    # учитывать необязательный pinTitle из front-matter статьи.
    $text = $Title.Trim()
    $chosen = $null
    $chosenLines = $null
    foreach ($size in 88, 82, 76, 70, 64, 58, 52, 46, 42) {
        $font = New-Font $boldFamily $size $BoldStyle
        $lines = Wrap-Balanced $g $text $font $contentW
        $height = $lines.Count * $size * 1.16
        $widest = ($lines | ForEach-Object { Measure-TextWidth $g $_ $font } | Measure-Object -Maximum).Maximum
        if ($lines.Count -le 4 -and $height -le $titleSpace -and $widest -le $contentW) {
            $chosen = $font
            $chosenLines = $lines
            break
        }
        $font.Dispose()
    }
    if (-not $chosen) {
        $chosen = New-Font $boldFamily 40 $BoldStyle
        $chosenLines = Wrap-Balanced $g $text $chosen $contentW
    }

    $whiteBrush = New-Object System.Drawing.SolidBrush $White
    $size = $chosen.Size
    $blockHeight = $chosenLines.Count * $size * 1.16
    # Блок стоит по центру свободной высоты: иначе под коротким заголовком
    # остаётся провал в четверть пина.
    $y = $titleTop + [Math]::Max(0, ($titleSpace - $blockHeight) / 2)
    foreach ($line in $chosenLines) {
        $g.DrawString($line, $chosen, $whiteBrush, $padX, $y, $sf)
        $y += $size * 1.16
    }
    $whiteBrush.Dispose()
    $chosen.Dispose()

    # Подпись бренда внизу ($footerY посчитан выше — по ней же центрируется заголовок).
    $brandFont = New-Font $boldFamily 40 $BoldStyle
    $domainFont = New-Font $regularFamily 30 $Regular
    $brandBrush = New-Object System.Drawing.SolidBrush $White
    $g.DrawString('TidyPlan', $brandFont, $brandBrush, $padX, $footerY, $sf)
    $brandW = Measure-TextWidth $g 'TidyPlan' $brandFont
    $g.DrawString('· tidyplan.ru', $domainFont, $softBrush, ($padX + $brandW + 18), ($footerY + 12), $sf)
    $brandBrush.Dispose()
    $brandFont.Dispose()
    $domainFont.Dispose()
    $softBrush.Dispose()

    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 88

    New-Item -ItemType Directory -Force (Split-Path -Parent $Out) | Out-Null
    $bmp.Save($Out, $encoder, $params)
    $bmp.Dispose()
    $g.Dispose()
    $params.Dispose()
}

# ── Обход статей ──────────────────────────────────────────────────────────
$jobs = @(
    @{ lang = 'ru'; dir = 'web/content/tips'; out = 'docs/pins/ru' },
    @{ lang = 'en'; dir = 'web/content/en/tips'; out = 'docs/pins/en' }
)

$count = 0
# Строки для таблицы загрузки. Доски берём из pins-labels.json: у русского
# набора они русские, у английского — английские, чтобы пин не уезжал на доску
# с чужим языком.
$rows = New-Object System.Collections.Generic.List[object]
foreach ($job in $jobs) {
    $files = Get-ChildItem (Join-Path $Root $job.dir) -Filter *.md | Sort-Object Name
    foreach ($file in $files) {
        $fm = Get-FrontMatter $file.FullName
        # Имя переменной не `$slug`: PowerShell не различает регистр, и локальная
        # `$slug` затирала бы параметр `$Slug` — фильтр по одному слагу не работал.
        $fileSlug = $file.BaseName
        if ($Slug -and $fileSlug -ne $Slug) { continue }
        $cover = Join-Path $Root ('web/public' + $fm['cover'])
        if (-not (Test-Path $cover)) { Write-Warning "нет обложки: $cover"; continue }
        $icon = if ($fm['icon']) { $fm['icon'] -replace '^pi-', '' } else { 'lightbulb' }

        # Код глифа берём из primeicons.css, чтобы не держать таблицу вручную.
        $css = Join-Path $Root 'web/node_modules/primeicons/primeicons.css'
        if (-not $script:iconMap) {
            $script:iconMap = @{}
            foreach ($m in [regex]::Matches([System.IO.File]::ReadAllText($css), '\.pi-([a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-f]+)"')) {
                $script:iconMap[$m.Groups[1].Value] = $m.Groups[2].Value
            }
        }
        $glyph = if ($script:iconMap.ContainsKey($icon)) { $script:iconMap[$icon] } else { $script:iconMap['lightbulb'] }

        # Необязательный pinTitle из front-matter важнее автообрезки: «Матрас,
        # подушки, постель» без «как чистить» теряет смысл.
        $pinTitle = if ($fm['pinTitle']) { $fm['pinTitle'] } else { Get-PinTitle $fm['title'] }

        New-Pin -Cover $cover -Title $pinTitle -Category $fm['category'] -Minutes $fm['minutes'] `
            -Icon $glyph -Language $job.lang -Out (Join-Path $Root (Join-Path $job.out "$fileSlug.jpg"))
        $count++
        Write-Host "pin: $($job.lang)/$fileSlug"

        # Строка для таблицы загрузки: файл, ссылка с UTM, заголовок, описание, доска.
        $rows.Add([pscustomobject]@{
            file        = "$($job.lang)/$fileSlug.jpg"
            lang        = $job.lang
            board       = $labels.$($job.lang).boards.$($fm['category'])
            pinTitle    = $pinTitle
            description = Get-PinDescription $fm['title'] $fm['description'] $job.lang $fm['category']
            # ${fileSlug}, а не $fileSlug: `?` — допустимый символ в имени
            # переменной, и `$fileSlug?utm_source` разобралось бы как одно имя.
            link        = if ($job.lang -eq 'en') {
                "https://tidyplan.ru/en/tips/${fileSlug}?utm_source=pinterest&utm_medium=social&utm_campaign=$fileSlug"
            }
            else {
                # Русские пины идут не в Pinterest, а в Дзен, Telegram и VK:
                # `pin` в utm_source заменяется на канал в момент публикации.
                "https://tidyplan.ru/tips/${fileSlug}?utm_source=pin&utm_medium=social&utm_campaign=$fileSlug"
            }
        }) | Out-Null
    }
}

Write-Host "готово: $count"

# Таблицу пишем только при полной сборке: при -Slug в ней оказалась бы одна строка
# и затёрла полный список.
if (-not $Slug) {
    $csv = Join-Path $Root 'docs/pins/pins.csv'
    $rows | Export-Csv -Path $csv -NoTypeInformation -Encoding UTF8 -Delimiter ';'
    Write-Host "таблица: $csv"
}
