/**
 * 国家选择器
 * 提供按字母搜索国家功能，支持显示/img/flags/目录下的所有国家图标
 */

// 国家名称映射（代码 -> 名称）
const countryNames = {
    // 常见国家
    'CN': '中国',
    'HK': '香港',
    'TW': '台湾',
    'JP': '日本',
    'KR': '韩国',
    'SG': '新加坡',
    'US': '美国',
    'CA': '加拿大',
    'UK': '英国', // 注意：UK使用GB的图标
    'GB': '英国',
    'DE': '德国',
    'FR': '法国',
    'AU': '澳大利亚',
    'RU': '俄罗斯',
    'UA': '乌克兰',
    'BR': '巴西',
    'IN': '印度',
    'ZA': '南非',
    // 特殊代码
    'LO': '本地网络',
    'OT': '其他地区',
    // 其他国家将在初始化时动态加载
};

// 国家列表（用于存储所有国家的代码）
let allCountryCodes = [];

// 当前选中的国家代码
window.currentSelectedCountry = '';

/**
 * 初始化国家选择器
 */
function initCountrySelector() {
    console.log('初始化国家选择器...');

    try {
        // 获取DOM元素
        const searchInput = document.getElementById('country-search');
        const countryListContainer = document.getElementById('country-list-container');
        const countryList = document.getElementById('country-list');
        const selectedCountryFlag = document.getElementById('selected-country-flag');
        const selectedCountryName = document.getElementById('selected-country-name');
        const selectedCountryCode = document.getElementById('selected-country-code');
        const hiddenInput = document.getElementById('edit_location_country_code');

        // 检查必要的DOM元素是否存在
        if (!searchInput || !countryListContainer || !countryList ||
            !selectedCountryFlag || !selectedCountryName || !selectedCountryCode || !hiddenInput) {
            console.error('国家选择器初始化失败：缺少必要的DOM元素');
            return;
        }

        // 获取初始选中的国家代码
        const initialCountryCode = hiddenInput.value || 'OT';

        // 加载所有国家代码
        loadAllCountryCodes().then(() => {
            // 设置初始选中的国家
            selectCountry(initialCountryCode);

            // 绑定搜索输入事件
            searchInput.addEventListener('input', function() {
                const searchText = this.value.trim().toUpperCase();

                if (searchText) {
                    // 筛选匹配的国家
                    const matchedCountries = allCountryCodes.filter(code =>
                        code.startsWith(searchText) ||
                        (countryNames[code] && countryNames[code].includes(searchText))
                    );

                    // 显示匹配的国家列表
                    renderCountryList(matchedCountries);
                    countryListContainer.classList.remove('hidden');
                } else {
                    // 隐藏国家列表
                    countryListContainer.classList.add('hidden');
                }
            });

            // 绑定搜索框焦点事件
            searchInput.addEventListener('focus', function() {
                const searchText = this.value.trim().toUpperCase();
                if (searchText) {
                    // 如果有搜索文本，显示匹配的国家列表
                    const matchedCountries = allCountryCodes.filter(code =>
                        code.startsWith(searchText) ||
                        (countryNames[code] && countryNames[code].includes(searchText))
                    );
                    renderCountryList(matchedCountries);
                    countryListContainer.classList.remove('hidden');
                }
            });

            // 绑定文档点击事件，点击外部区域时隐藏国家列表
            document.addEventListener('click', function(event) {
                if (!countryListContainer.contains(event.target) && event.target !== searchInput) {
                    countryListContainer.classList.add('hidden');
                }
            });

            // 绑定特殊选项点击事件
            document.querySelectorAll('.country-option').forEach(option => {
                option.addEventListener('click', function() {
                    const code = this.getAttribute('data-code');
                    selectCountry(code);
                    countryListContainer.classList.add('hidden');
                    searchInput.value = '';
                });
            });
        }).catch(error => {
            console.error('加载国家代码失败:', error);
        });
    } catch (error) {
        console.error('国家选择器初始化失败:', error);
    }
}

/**
 * 加载所有国家代码
 * 通过AJAX请求获取/img/flags/目录下的所有SVG文件
 */
async function loadAllCountryCodes() {
    try {
        // 这里我们使用一个简单的方法：预定义一个包含所有常见国家代码的数组
        // 在实际应用中，您可能需要通过AJAX请求获取目录列表

        // 常见国家代码（按字母顺序排序）
        const commonCodes = [
            'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
            'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
            'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
            'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
            'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'EU',
            'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
            'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
            'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
            'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
            'JE', 'JM', 'JO', 'JP',
            'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
            'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
            'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
            'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
            'OM',
            'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
            'QA',
            'RE', 'RO', 'RS', 'RU', 'RW',
            'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
            'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
            'UA', 'UG', 'UM', 'UN', 'US', 'UY', 'UZ',
            'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
            'WF', 'WS',
            'XK',
            'YE', 'YT',
            'ZA', 'ZM', 'ZW'
        ];

        // 添加特殊代码
        const specialCodes = ['LO', 'OT'];

        // 合并所有代码
        allCountryCodes = [...commonCodes, ...specialCodes];

        // 为没有名称的国家添加默认名称
        allCountryCodes.forEach(code => {
            if (!countryNames[code] && code !== 'LO' && code !== 'OT') {
                countryNames[code] = code;
            }
        });

        console.log(`加载了 ${allCountryCodes.length} 个国家代码`);
    } catch (error) {
        console.error('加载国家代码失败:', error);
    }
}

/**
 * 渲染国家列表
 * @param {Array} countryCodes - 要显示的国家代码数组
 */
function renderCountryList(countryCodes) {
    const countryList = document.getElementById('country-list');

    // 清空列表
    countryList.innerHTML = '';

    // 添加国家选项
    countryCodes.forEach(code => {
        // 创建国家选项元素
        const countryOption = document.createElement('div');
        countryOption.className = 'country-option cursor-pointer flex items-center gap-2 p-2 bg-slate-800 rounded-md hover:bg-slate-700';
        countryOption.setAttribute('data-code', code);

        // 创建国旗元素
        const flagElement = document.createElement('div');
        flagElement.className = 'w-6 h-4 flex-shrink-0 overflow-hidden rounded-sm border border-slate-700';

        // 设置国旗图片或图标
        if (code === 'LO') {
            // 本地网络使用图标
            const icon = document.createElement('i');
            icon.className = 'material-icons text-slate-200';
            icon.textContent = 'home';
            flagElement.appendChild(icon);
        } else if (code === 'OT') {
            // 其他地区使用图标
            const icon = document.createElement('i');
            icon.className = 'material-icons text-slate-200';
            icon.textContent = 'public';
            flagElement.appendChild(icon);
        } else if (code === 'UK') {
            // 英国使用GB的图标
            const img = document.createElement('img');
            img.src = '/img/flags/GB.SVG';
            img.alt = code;
            img.className = 'w-full h-full object-cover';
            flagElement.appendChild(img);
        } else {
            // 其他国家使用对应的SVG图标
            const img = document.createElement('img');
            img.src = `/img/flags/${code}.SVG`;
            img.alt = code;
            img.className = 'w-full h-full object-cover';
            img.onerror = function() {
                // 图片加载失败时显示问号图标
                this.style.display = 'none';
                const icon = document.createElement('i');
                icon.className = 'material-icons text-slate-200';
                icon.textContent = 'help_outline';
                this.parentNode.appendChild(icon);
            };
            flagElement.appendChild(img);
        }

        // 创建国家名称元素
        const nameElement = document.createElement('span');
        nameElement.className = 'text-slate-200 flex-grow text-sm';
        nameElement.textContent = countryNames[code] || code;

        // 创建国家代码元素
        const codeElement = document.createElement('span');
        codeElement.className = 'text-slate-400 text-xs';
        codeElement.textContent = code;

        // 组装国家选项
        countryOption.appendChild(flagElement);
        countryOption.appendChild(nameElement);
        countryOption.appendChild(codeElement);

        // 添加点击事件
        countryOption.addEventListener('click', function() {
            selectCountry(code);
            document.getElementById('country-list-container').classList.add('hidden');
            document.getElementById('country-search').value = '';
        });

        // 添加到列表
        countryList.appendChild(countryOption);
    });
}

/**
 * 选择国家
 * @param {string} code - 国家代码
 */
function selectCountry(code) {
    try {
        // 更新隐藏输入框的值
        const hiddenInput = document.getElementById('edit_location_country_code');
        if (!hiddenInput) {
            console.error('选择国家失败：找不到隐藏输入框');
            return;
        }
        hiddenInput.value = code;

        // 更新选中的国家显示
        const selectedCountryFlag = document.getElementById('selected-country-flag');
        const selectedCountryName = document.getElementById('selected-country-name');
        const selectedCountryCode = document.getElementById('selected-country-code');

        // 检查必要的DOM元素是否存在
        if (!selectedCountryFlag || !selectedCountryName || !selectedCountryCode) {
            console.error('选择国家失败：缺少必要的DOM元素');
            return;
        }

        // 清空当前显示
        selectedCountryFlag.innerHTML = '';

        // 设置国旗图片或图标
        if (code === 'LO') {
            // 本地网络使用图标
            const icon = document.createElement('i');
            icon.className = 'material-icons text-slate-200';
            icon.textContent = 'home';
            selectedCountryFlag.appendChild(icon);
        } else if (code === 'OT') {
            // 其他地区使用图标
            const icon = document.createElement('i');
            icon.className = 'material-icons text-slate-200';
            icon.textContent = 'public';
            selectedCountryFlag.appendChild(icon);
        } else if (code === 'UK') {
            // 英国使用GB的图标
            const img = document.createElement('img');
            img.src = '/img/flags/GB.SVG';
            img.alt = code;
            img.className = 'w-full h-full object-cover';
            selectedCountryFlag.appendChild(img);
        } else {
            // 其他国家使用对应的SVG图标
            const img = document.createElement('img');
            img.src = `/img/flags/${code}.SVG`;
            img.alt = code;
            img.className = 'w-full h-full object-cover';
            img.onerror = function() {
                // 图片加载失败时显示问号图标
                this.style.display = 'none';
                const icon = document.createElement('i');
                icon.className = 'material-icons text-slate-200';
                icon.textContent = 'help_outline';
                this.parentNode.appendChild(icon);
            };
            selectedCountryFlag.appendChild(img);
        }

        // 设置国家名称和代码
        selectedCountryName.textContent = countryNames[code] || code;
        selectedCountryCode.textContent = code;

        // 保存当前选中的国家代码
        window.currentSelectedCountry = code;

        console.log(`选择了国家: ${code} (${countryNames[code] || code})`);
    } catch (error) {
        console.error('选择国家失败:', error);
    }
}

// 页面加载完成后初始化国家选择器
document.addEventListener('DOMContentLoaded', initCountrySelector);
