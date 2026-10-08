// Supabase 프로젝트 URL과 브라우저용 publishable 키 또는 anon 키를 직접 입력해주세요.
// service_role 키나 secret 키는 브라우저에서 사용하지 않습니다.
const SUPABASE_URL = 'https://haggkwsgnbcbssnsrzlc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZ2drd3NnbmJjYnNzbnNyemxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTQzODUsImV4cCI6MjEwNjk5MDM4NX0.BbBbNTL37ucipM4X2Oui-p2lcrHyyhVtr6f5HIgCJdQ';

// CDN에서 불러온 supabase 라이브러리로 DB 연결용 클라이언트를 만듭니다.
// 값을 아직 넣지 않았거나 CDN 로딩에 실패해도 금액 계산과 탭은 동작하게 합니다.
let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (error) {
    console.error('Supabase 연결 초기화 실패:', error);
  }
}

// index.html에서 필요한 요소를 찾습니다.
// HTML의 script 태그에 defer가 있으므로 HTML을 읽은 뒤 이 코드가 실행됩니다.
const orderForm = document.getElementById('order-form');
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const drinkSelect = document.getElementById('drink');
const quantityInput = document.getElementById('quantity');
const totalPriceDisplay = document.getElementById('total-price');
const orderConfirmation = document.getElementById('order-confirmation');
const sizeInputs = orderForm.querySelectorAll('input[name="size"]');
const optionInputs = orderForm.querySelectorAll('input[name="options"]');
const requestsInput = document.getElementById('requests');
const orderTab = document.getElementById('order-tab');
const historyTab = document.getElementById('history-tab');
const ordersPanel = document.getElementById('orders-panel');
const ordersList = document.getElementById('orders-list');
const ordersEmpty = document.getElementById('orders-empty');
const orderCount = document.getElementById('order-count');
const ordersTotal = document.getElementById('orders-total');
const clearOrdersButton = document.getElementById('clear-orders');
const submitOrderButton = document.getElementById('submit-order');
const resetOrderButton = document.getElementById('reset-order');

// 버튼 비활성화와 함께 저장 상태를 검사해 Enter 키 등으로 중복 제출되는 것도 막습니다.
let isSaving = false;

// 접수된 주문을 객체로 만들어 이 배열에 저장합니다.
// 페이지를 새로고침하면 배열은 초기화됩니다. 다시 작성 버튼은 이 배열을 건드리지 않습니다.
// 이 배열의 번호는 화면용입니다. DB 주문번호는 Supabase가 별도로 생성합니다.
// 현재 내역의 취소와 모두 지우기는 화면의 배열만 수정하며 DB의 주문은 유지합니다.
const orders = [];
let nextOrderNumber = 1;

// 탭을 바꿀 때 입력을 초기화하지 않고 hidden 클래스만 붙이거나 뗍니다.
function switchTab(selectedTab) {
  const showOrderForm = selectedTab === orderTab;
  orderForm.classList.toggle('hidden', !showOrderForm);
  ordersPanel.classList.toggle('hidden', showOrderForm);

  [orderTab, historyTab].forEach((tab) => {
    const isSelected = tab === selectedTab;
    tab.classList.toggle('active', isSelected);
    tab.setAttribute('aria-selected', String(isSelected));
    // 선택된 탭만 Tab 키로 접근하며, 방향키로 다른 탭을 선택할 수 있습니다.
    tab.tabIndex = isSelected ? 0 : -1;
  });
}

[orderTab, historyTab].forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const selectedTab = event.key === 'Home' ? orderTab
      : event.key === 'End' ? historyTab
      : tab === orderTab ? historyTab : orderTab;
    switchTab(selectedTab);
    selectedTab.focus();
  });
});

// 주문 목록, 빈 목록 안내, 건수 배지, 합계는 항상 이 함수 하나로 그립니다.
function renderOrders() {
  // 이전 카드를 모두 제거한 뒤 현재 orders 배열을 기준으로 다시 만듭니다.
  // innerHTML을 사용하지 않고 DOM 요소를 직접 생성합니다.
  ordersList.replaceChildren();

  orders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-card';
    const content = document.createElement('div');

    // 1줄: 주문번호, 손님 이름, 총 금액
    const heading = document.createElement('p');
    heading.className = 'order-heading';
    heading.textContent = `#${order.id} ${order.name}님 · ${order.amount.toLocaleString('ko-KR')}원`;

    // 2줄: 음료와 사이즈, 선택한 옵션, 수량. 옵션이 없으면 괄호를 생략합니다.
    const details = document.createElement('p');
    details.className = 'order-details';
    const optionText = order.options.length > 0 ? ` (${order.options.join(', ')})` : '';
    details.textContent = `${order.drink} ${order.size}사이즈${optionText} ${order.quantity}잔`;

    // 3줄: 요청사항이 있으면 시간 앞에 표시하고, 없으면 시간만 표시합니다.
    const meta = document.createElement('p');
    meta.className = 'order-meta';
    const timeText = order.orderedAt.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    meta.textContent = `${order.requests ? `${order.requests} · ` : ''}${timeText}`;

    // 손님이 입력한 이름과 요청사항은 textContent로 넣어 HTML 실행을 막습니다.
    content.append(heading, details, meta);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'cancel-order';
    cancelButton.textContent = '취소';
    cancelButton.setAttribute('aria-label', `주문 #${order.id} 취소`);
    cancelButton.addEventListener('click', () => {
      // 취소 확인창에서 확인을 눌렀을 때만 해당 주문을 삭제합니다.
      if (!confirm(`#${order.id} 주문을 취소하시겠습니까?`)) return;
      const index = orders.findIndex((savedOrder) => savedOrder.id === order.id);
      if (index !== -1) orders.splice(index, 1);
      renderOrders();
    });

    card.append(content, cancelButton);
    ordersList.append(card);
  });

  const totalAmount = orders.reduce((sum, order) => sum + order.amount, 0);
  orderCount.textContent = String(orders.length);
  ordersTotal.textContent = `총 주문 금액: ${totalAmount.toLocaleString('ko-KR')}원 (${orders.length}건)`;
  ordersEmpty.classList.toggle('hidden', orders.length > 0);
  clearOrdersButton.disabled = orders.length === 0;
}

clearOrdersButton.addEventListener('click', () => {
  if (orders.length === 0) return;
  // 여러 주문을 한꺼번에 지우므로 확인창에서 한 번 더 확인합니다.
  if (!confirm('주문 내역을 모두 지우시겠습니까?')) return;
  orders.splice(0, orders.length);
  // 삭제 후에도 주문번호는 계속 증가해 이전 번호를 재사용하지 않습니다.
  renderOrders();
});

// 예상 금액 계산과 화면 표시를 한 함수에서 처리합니다.
// 선택 항목을 바꾸거나 주문할 때마다 같은 함수를 재사용합니다.
function calculateTotal() {
  let total = 0;

  // 음료를 고르지 않았다면 사이즈나 옵션을 선택해도 총액은 0원입니다.
  if (drinkSelect.value !== '') {
    const selectedDrink = drinkSelect.selectedOptions[0];
    const selectedSize = orderForm.querySelector('input[name="size"]:checked');

    // dataset.price는 HTML의 data-price 값을 문자열로 가져옵니다.
    // Number()로 숫자로 바꿔야 문자열을 이어 붙이지 않고 덧셈할 수 있습니다.
    const drinkPrice = Number(selectedDrink.dataset.price);
    const sizePrice = Number(selectedSize.dataset.price);
    let optionPrice = 0;

    // 체크한 옵션만 한 잔의 추가 금액에 더합니다.
    optionInputs.forEach((option) => {
      if (option.checked) {
        optionPrice += Number(option.dataset.price);
      }
    });

    const quantity = Number(quantityInput.value);

    // 수량을 지우거나 잘못 입력한 동안에는 0원으로 표시합니다.
    // 주문할 때에는 아래에서 1~10 사이의 정수인지 따로 확인합니다.
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 10) {
      total = (drinkPrice + sizePrice + optionPrice) * quantity;
    }
  }

  // 한국어 숫자 형식으로 천 단위 콤마를 넣습니다. 예: 5000 → 5,000
  // 기존 HTML의 "예상 금액:"과 "원"은 유지하고 숫자 부분만 바꿉니다.
  totalPriceDisplay.textContent = total.toLocaleString('ko-KR');

  // 계산 결과를 반환하면 주문 확인 메시지에서도 같은 금액을 쓸 수 있습니다.
  return total;
}

// 드롭다운, 라디오, 체크박스는 선택이 바뀔 때마다 다시 계산합니다.
drinkSelect.addEventListener('change', calculateTotal);
sizeInputs.forEach((size) => {
  size.addEventListener('change', calculateTotal);
});
optionInputs.forEach((option) => {
  option.addEventListener('change', calculateTotal);
});

// input 이벤트는 수량을 입력하거나 화살표로 바꾸는 즉시 발생합니다.
// change 이벤트도 연결해 입력을 확정했을 때 금액을 다시 확인합니다.
quantityInput.addEventListener('input', calculateTotal);
quantityInput.addEventListener('change', calculateTotal);

// 버튼 클릭뿐 아니라 Enter 키로 주문할 때도 처리하도록 form의 submit을 듣습니다.
orderForm.addEventListener('submit', async (event) => {
  // 기본 제출 동작을 막아 페이지가 새로고침되지 않게 합니다.
  event.preventDefault();
  if (isSaving) return;

  // trim()은 앞뒤 공백을 제거합니다. 공백만 입력한 경우도 빈 값으로 봅니다.
  const customerName = customerNameInput.value.trim();
  const customerPhone = customerPhoneInput.value.trim();

  // 문제가 있으면 알림을 띄우고 해당 입력칸으로 이동한 뒤 처리를 끝냅니다.
  if (customerName === '') {
    alert('이름을 입력해주세요');
    customerNameInput.focus();
    return;
  }

  if (drinkSelect.value === '') {
    alert('음료를 선택해주세요');
    drinkSelect.focus();
    return;
  }

  if (customerPhone === '') {
    alert('전화번호를 입력해주세요');
    customerPhoneInput.focus();
    return;
  }

  // form에 novalidate가 있으므로 수량 제한도 JavaScript에서 확인합니다.
  const quantity = Number(quantityInput.value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    alert('수량은 1부터 10까지의 정수로 입력해주세요');
    quantityInput.focus();
    return;
  }

  const total = calculateTotal();
  const selectedDrink = drinkSelect.selectedOptions[0];
  const selectedSize = orderForm.querySelector('input[name="size"]:checked');

  // 선택한 음료의 글자에서 끝의 가격을 빼고 이름만 가져옵니다.
  // 예: "카페라떼 4,000원" → "카페라떼"
  const drinkName = selectedDrink.textContent.replace(/\s+[\d,]+원\s*$/, '').trim();
  const selectedOptionNames = [];

  optionInputs.forEach((option) => {
    if (option.checked) {
      // labels[0]은 for/id로 연결된 라벨입니다. 끝의 추가 금액을 제거합니다.
      // 예: "샷 추가 +500원" → "샷 추가"
      const optionName = option.labels[0].textContent.replace(/\s*\+[\d,]+원\s*$/, '').trim();
      selectedOptionNames.push(optionName);
    }
  });

  // 옵션이 있으면 괄호로 묶고, 없으면 빈 문자열로 만들어 괄호를 생략합니다.
  const optionText = selectedOptionNames.length > 0
    ? ` (${selectedOptionNames.join(', ')})`
    : '';

  // 객체의 키 이름이 Supabase 테이블의 열 이름과 정확히 같아야 합니다.
  // 저장 요청을 보내기 전에 값을 복사해 입력칸을 수정해도 접수 내용이 달라지지 않게 합니다.
  const orderData = {
    customer_name: customerName,
    phone: customerPhone,
    drink: drinkName,
    drink_price: Number(selectedDrink.dataset.price),
    size: selectedSize.value,
    options: [...selectedOptionNames],
    quantity,
    request: requestsInput.value.trim(),
    total_price: total,
  };

  const originalButtonText = submitOrderButton.textContent;
  isSaving = true;
  submitOrderButton.disabled = true;
  submitOrderButton.textContent = '저장 중...';
  submitOrderButton.setAttribute('aria-busy', 'true');
  // 저장 도중 초기화되어 접수 메시지와 입력 내용이 어긋나지 않도록 잠깐 막습니다.
  resetOrderButton.disabled = true;
  orderConfirmation.classList.add('hidden');

  try {
    if (!supabaseClient) {
      throw new Error('SUPABASE_URL과 SUPABASE_KEY 값 및 Supabase CDN 로딩을 확인해주세요.');
    }

    // await는 서버의 응답을 기다립니다. 응답의 error가 있으면 저장 실패입니다.
    // id와 ordered_at은 DB가 자동으로 생성하므로 보내지 않습니다.
    // insert()만 사용해 주문을 저장하며, 고객 정보 조회 권한은 요청하지 않습니다.
    const { error } = await supabaseClient.from('cafe_orders').insert(orderData);
    if (error) throw error;

    // DB 저장에 성공한 경우에만 기존 접수 메시지를 보여줍니다.
    // textContent를 사용하면 입력한 이름이 HTML 코드로 실행되지 않습니다.
    orderConfirmation.textContent = `${orderData.customer_name}님, ${orderData.drink} ${orderData.size}사이즈${optionText} ${orderData.quantity}잔, 총 ${orderData.total_price.toLocaleString('ko-KR')}원 주문이 접수되었습니다!`;
    orderConfirmation.classList.remove('hidden');

    // 저장에 성공한 주문만 현재 페이지의 내역 배열에도 추가합니다.
    orders.unshift({
      id: nextOrderNumber++,
      name: orderData.customer_name,
      drink: orderData.drink,
      size: orderData.size,
      options: [...orderData.options],
      quantity: orderData.quantity,
      requests: orderData.request,
      amount: orderData.total_price,
      orderedAt: new Date(),
    });
    renderOrders();
  } catch (error) {
    // 권한 오류, 테이블 구조 오류, 네트워크 오류 등은 콘솔에서 자세히 확인합니다.
    console.error('주문 저장 오류:', error);
    alert('주문 저장에 실패했어요');
  } finally {
    // 성공과 실패에 관계없이 버튼과 저장 상태를 복원해 다시 주문할 수 있게 합니다.
    isSaving = false;
    submitOrderButton.disabled = false;
    submitOrderButton.textContent = originalButtonText;
    submitOrderButton.setAttribute('aria-busy', 'false');
    resetOrderButton.disabled = false;
  }
});

// "다시 작성"은 type="reset" 버튼이므로 브라우저가 입력을 기본값으로 돌립니다.
// 이름·전화번호·요청사항은 비워지고, 음료와 옵션은 해제되며 M 사이즈와 수량 1이 복원됩니다.
orderForm.addEventListener('reset', () => {
  // 입력칸이 기본값으로 돌아가기 전 발생하는 이벤트이므로 계산은 하지 않습니다.
  // 초기 상태에는 선택한 음료가 없으므로 금액을 바로 0으로 표시합니다.
  totalPriceDisplay.textContent = (0).toLocaleString('ko-KR');
  orderConfirmation.textContent = '';
  orderConfirmation.classList.add('hidden');
  // orders 배열을 수정하지 않으므로 주문 내역과 건수는 그대로 남습니다.
});

// 페이지를 처음 열었을 때에도 현재 선택 상태에 맞는 금액을 표시합니다.
calculateTotal();
renderOrders();
